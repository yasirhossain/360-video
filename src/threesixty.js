import THREE from './three'

// TODO strip out options
// TODO see if you can remove need for window / document by using attach to pass elements only

const ThreeSixty = (THREE, window, document) => {
  let self = {},
      defaults = {
        crossOrigin: 'anonymous',
        clickAndDrag: false,
	      keyboardControls: true,
        fov: 35,
        fovMin: 3,
        fovMax: 100,
        hideControls: false,
        lon: 0,
        lat: 0,
        loop: "loop",
        debug: false,
        flatProjection: false,
        autoplay: true
      },
      div,
      video

    const Detector = {
      canvas: !! window.CanvasRenderingContext2D,
      webgl: ( function () { try { var canvas = document.createElement( 'canvas' ); return !! window.WebGLRenderingContext && ( canvas.getContext( 'webgl' ) || canvas.getContext( 'experimental-webgl' ) ); } catch( e ) { return false; } } )(),
      workers: !! window.Worker,
      fileapi: window.File && window.FileReader && window.FileList && window.Blob,
      getWebGLErrorMessage: () => {
        let element = document.createElement('div')
        element.id = 'webgl-error-message'
        element.style.fontFamily = 'monospace'
        element.style.fontSize = '13px'
        element.style.fontWeight = 'normal'
        element.style.textAlign = 'center'
        element.style.background = '#fff'
        element.style.color = '#000'
        element.style.padding = '1.5em'
        element.style.width = '800px'
        element.style.margin = '5em auto 0'
        if (!self.webgl) {
          element.innerHTML = window.WebGLRenderingContext ? [
            'Your graphics card does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br />',
            'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'
          ].join( '\n' ) : [
            'Your browser does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br/>',
            'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'
          ].join( '\n' );
        }

        return element;
      },
      addGetWebGLMessage: (parameters) => {
        let parent, id, element

        parameters = parameters || {}

        parent = parameters.parent !== undefined ? parameters.parent : document.body
        id = parameters.id !== undefined ? parameters.id : 'oldie'

        element = Detector.getWebGLErrorMessage()
        element.id = id

        parent.appendChild(element)
      }
    }

  const attachContainer = (element) => {
    self.element = element
    self.options = defaults

    // instantiate some local variables we're going to need
    self.time = new Date().getTime()
    self.controls = {}
    self.id = generateUUID()

    self.requestAnimationId = '' // used to cancel requestAnimationFrame on destroy
    self.isVideo = false
    self.isPhoto = false
    self.isFullscreen = false
    self.mouseDown = false
    self.dragStart = {}

    self.lat = self.options.lat;
    self.lon = self.options.lon;
    self.fov = self.options.fov;

    // save our original height and width for returning from fullscreen
    self.originalWidth = self.element.querySelectorAll('canvas').offsetWidth
    self.originalHeight = self.element.querySelectorAll('canvas').offsetHeight

    // add a class to our element so it inherits the appropriate styles
    if (self.element.classList)
      self.element.classList.add('default')
    else
      self.element.className += ' ' + 'default'

    // add tabindex attribute to enable the focus on the element (required for keyboard controls)
    if(self.options.keyboardControls && !self.element.getAttribute("tabindex")) {
      self.element.setAttribute("tabindex", "1")
    }
  }

  const attachVideo = (element) => {
    video = element
    createMediaPlayer()
    createControls()
  }

  const generateUUID = () => {
    let d = new Date().getTime(),
        uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          let r = (d + Math.random()*16)%16 | 0
          d = Math.floor(d/16);
          return (c==='x' ? r : (r&0x7|0x8)).toString(16);
        })
    return uuid
  }

  const createMediaPlayer = () => {
    // make a self reference we can pass to our callbacks
    // create a local THREE.js scene
    self.scene = new THREE.Scene()

    // create ThreeJS camera
    self.camera = new THREE.PerspectiveCamera(self.fov, self.element.offsetWidth / self.element.offsetHeight, 0.1, 1000)
    self.camera.setLens(self.fov)

    // create ThreeJS renderer and append it to our object
    self.renderer = Detector.webgl? new THREE.WebGLRenderer(): new THREE.CanvasRenderer()
    self.renderer.setSize(self.element.offsetWidth, self.element.offsetHeight)
    self.renderer.autoClear = false
    self.renderer.setClearColor(0x333333, 1)

    // append the rendering element to self div
    self.element.appendChild(self.renderer.domElement)

    const createAnimation = () => {
      self.texture.generateMipmaps = false
      self.texture.minFilter = THREE.LinearFilter
      self.texture.magFilter = THREE.LinearFilter
      self.texture.format = THREE.RGBFormat

      // create ThreeJS mesh sphere onto which our texture will be drawn
      self.mesh = new THREE.Mesh(new THREE.SphereGeometry( 500, 80, 50 ), new THREE.MeshBasicMaterial({map: self.texture}))
      self.mesh.scale.x = -1 // mirror the texture, since we're looking from the inside out
      self.scene.add(self.mesh)

      animate()
    }

    // figure out our texturing situation, based on what our source is
    if(self.element.getAttribute('data-photo-src')) {
      self.isPhoto = true
      THREE.ImageUtils.crossOrigin = self.options.crossOrigin
      self.texture = THREE.ImageUtils.loadTexture(self.element.getAttribute('data-photo-src'))
      createAnimation()
    } else {
      if (video) {
        // create loading overlay
        let loadingElem = document.createElement('div')
        if (loadingElem.classList)
          loadingElem.classList.add('loading');
        else
          loadingElem.className += ' ' + 'loading'

        loadingElem.innerHTML = `
          <div class="icon waiting-icon"></div>
          <div class="icon error-icon"><i class="fa fa-exclamation-triangle" aria-hidden="true"></i></div>
        `
        self.element.appendChild(loadingElem)
        showWaiting()

        self.isVideo = true

        self.video = video
        self.video.setAttribute('crossorigin', self.options.crossOrigin)
        self.video.style.display = 'none'
        self.video.loop = self.options.loop

        // attach video player event listeners
        self.video.addEventListener("ended", () => {})

        // Progress Meter
        self.video.addEventListener("progress", () => {
          let percent = null
          if (self.video && self.video.buffered && self.video.buffered.length > 0 && self.video.buffered.end && self.video.duration) {
            percent = self.video.buffered.end(0) / self.video.duration
          }
          // Some browsers (e.g., FF3.6 and Safari 5) cannot calculate target.bufferered.end()
          // to be anything other than 0. If the byte count is available we use self instead.
          // Browsers that support the else if do not seem to have the bufferedBytes value and
          // should skip to there. Tested in Safari 5, Webkit head, FF3.6, Chrome 6, IE 7/8.
          else if (self.video && self.video.bytesTotal !== undefined && self.video.bytesTotal > 0 && self.video.bufferedBytes !== undefined) {
            percent = self.video.bufferedBytes / self.video.bytesTotal
          }

          // Someday we can have a loading animation for videos
          var cpct = Math.round(percent * 100)
          if(cpct === 100) {
            // do something now that we are done
          } else {
            // do something with self percentage info (cpct)
          }
        })

        // Error listener
        self.video.addEventListener('error', (event) => {
          console.error(self.video.error)
          showError()
        })

        self.video.addEventListener("timeupdate", () => {
          if (self.paused === false){
            let percent = self.currentTime * 100 / self.duration
            self.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].children[0].setAttribute("style", "width:" + percent + "%;")
            self.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].children[1].setAttribute("style", "width:" + (100 - percent) + "%;")
            //Update time label
            let durMin = Math.floor(self.duration / 60),
                durSec = Math.floor(self.duration - (durMin * 60)),
                timeMin = Math.floor(self.currentTime / 60),
                timeSec = Math.floor(self.currentTime - (timeMin * 60)),
                duration = durMin + ':' + (durSec < 10 ? '0' + durSec : durSec),
                currentTime = timeMin + ':' + (timeSec < 10 ? '0' + timeSec : timeSec)
            self.element.querySelectorAll('.controls .timeLabel').innerHTML = (currentTime + ' / ' + duration)
          }
        })

        // IE 11 and previous not supports THREE.Texture([video]), we must create a canvas that draws the video and use that to create the Texture
        var isIE = navigator.appName == 'Microsoft Internet Explorer' || !!(navigator.userAgent.match(/Trident/) || navigator.userAgent.match(/rv 11/))
        if (isIE) {
          self.videocanvas = document.createElement('canvas')
          self.texture = new THREE.Texture(self.videocanvas)
          // set canvas size = video size when known
          self.video.addEventListener('loadedmetadata', () => {
            self.videocanvas.width = self.video.videoWidth;
            self.videocanvas.height = self.video.videoHeight;
            createAnimation()
          })
        } else {
          self.texture = new THREE.Texture( self.video )
        }

        //force browser caching of the video to solve rendering errors with big videos
        let xhr = new XMLHttpRequest()
        xhr.open('GET', self.video.getAttribute('src'), true)
        xhr.responseType = 'blob'
        xhr.onload = function (e) {
          if (e.srcElement.status === 200) {
            let vid = URL.createObjectURL(e.srcElement.response)
            //Video Play Listener, fires after video loads
            self.video.addEventListener("canplaythrough", () => {
              if (self.options.autoplay === true) {
                hideWaiting()
                play()
                self.videoReady = true
              }
            })

            // set the video src and begin loading
            self.video.src = vid
          }
        };

        xhr.onreadystatechange = (oEvent) => {
          if (xhr.readyState === 4) {
            if (xhr.status !== 200) {
              console.error('Video error: status ' + xhr.status)
              showError()
            }
          }
        }
        xhr.send()

        if(!isIE) createAnimation()
      } else {
        console.log(`Please add a video`)
      }
    }
  }

  const createControls = () => {
    let playPauseControl = self.options.autoplay ? 'fa-pause' : 'fa-play',
        controlsElem = document.createElement('div')

    if (controlsElem.classList)
      controlsElem.classList.add('controlsWrapper')
    else
      controlsElem.className += ' ' + 'controlsWrapper'

    controlsElem.innerHTML = `
      <div class="progress-bar">
        <div style="width: 0;"></div><div style="width: 100%;"></div>
      </div>
      <div class="controls">
        <a href="#" class="playButton button fa '+ playPauseControl +'"></a>
        <span class="timeLabel"></span>
        <a href="#" class="fullscreenButton button fa fa-expand"></a>
      </div>`

    self.element.appendChild(controlsElem)

    // hide controls if option is set
    if(self.options.hideControls) {
      self.element.querySelectorAll('.controls').style.display = 'none'
    }

    // wire up controller events to dom elements
    attachControlEvents()
  }

  const attachControlEvents = () => {
    self.element.addEventListener( 'mousemove', onMouseMove.bind(self), false )
    self.element.addEventListener( 'touchmove', onMouseMove.bind(self), false )
    self.element.addEventListener( 'mousewheel', onMouseWheel.bind(self), false )
    self.element.addEventListener( 'DOMMouseScroll', onMouseWheel.bind(self), false )
    self.element.addEventListener( 'mousedown', onMouseDown.bind(self), false)
    self.element.addEventListener( 'touchstart', onMouseDown.bind(self), false)
    self.element.addEventListener( 'mouseup', onMouseUp.bind(self), false)
    self.element.addEventListener( 'touchend', onMouseUp.bind(self), false)

    if(self.options.keyboardControls) {
      self.element.addEventListener('keydown', onKeyDown.bind(self), false)
      self.element.addEventListener('keyup', onKeyUp.bind(self), false)
      // Used custom press event because for the arrow buttons is not throws the 'keypress' event
      self.element.addEventListener('keyArrowPress', onKeyArrowPress.bind(self), false)
      self.element.addEventListener('click', () => {
        self.element.focus()
      },false)
    }

    window.onresize = () => {
      resizeGL(self.element.offsetWidth, self.element.offsetHeight)
    }
  }

  const onMouseMove = (event) => {
    self.onPointerDownPointerX = event.clientX
    self.onPointerDownPointerY = -event.clientY

    let rect = self.element.querySelectorAll('canvas')[0].getBoundingClientRect()
    self.relativeX = event.pageX - rect.left

    self.onPointerDownLon = self.lon
    self.onPointerDownLat = self.lat

    let x, y

    if(self.options.clickAndDrag) {
      if(self.mouseDown) {
        x = event.pageX - self.dragStart.x
        y = event.pageY - self.dragStart.y
        self.dragStart.x = event.pageX
        self.dragStart.y = event.pageY
        self.lon += x
        self.lat -= y
      }
    } else {
      x = event.pageX - rect.left
      y = event.pageY - rect.top

      self.lon = ( x / self.element.querySelectorAll('canvas')[0].offsetWidth ) * 430 - 225
      self.lat = ( y / self.element.querySelectorAll('canvas')[0].offsetHeight ) * -180 + 90
    }
  }

  const onMouseWheel = (event) => {
    let wheelSpeed = -0.01

    // WebKit
    if (event.wheelDeltaY) {
      self.fov -= event.wheelDeltaY * wheelSpeed
    // Opera / Explorer 9
    } else if (event.wheelDelta) {
      self.fov -= event.wheelDelta * wheelSpeed
    // Firefox
    } else if (event.detail) {
      self.fov += event.detail * 1.0
    }

    if(self.fov < self.options.fovMin) {
      self.fov = self.options.fovMin
    } else if(self.fov > self.options.fovMax) {
      self.fov = self.options.fovMax
    }

    self.camera.setLens(self.fov)
    event.preventDefault()
  }

  const onMouseDown = (event) => {
    self.mouseDown = true
    self.dragStart.x = event.pageX
    self.dragStart.y = event.pageY
  }

  const onProgressClick = (event) => {
    if(self.isVideo && self.video.readyState === self.video.HAVE_ENOUGH_DATA) {
      let percent =  self.relativeX / self.element.querySelectorAll('canvas').offsetWidth * 100
      self.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].children[0].setAttribute("style", "width:" + percent + "%;")
      self.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].children[1].setAttribute("style", "width:" + (100 - percent) + "%;")
      self.video.currentTime = self.video.duration * percent / 100
    }
  }

  const onMouseUp = (event) => {
    self.mouseDown = false
  }

  const onKeyDown = (event) => {
   let keyCode = event.keyCode
   if (keyCode >= 37 && keyCode <= 40) {
     event.preventDefault()
     self.keydown = true
     let pressEvent = document.createEvent('CustomEvent')
     pressEvent.initCustomEvent("keyArrowPress",true,true,{'keyCode':keyCode})
     self.element.dispatchEvent(pressEvent)
   }
  }

  const onKeyUp = (event) => {
   let keyCode = event.keyCode;
   if (keyCode >= 37 && keyCode <= 40) {
     event.preventDefault()
     self.keydown = false
   }
  }

  const onKeyArrowPress = (event) => {
   if (self.keydown) {
     let keyCode = event.detail? event.detail.keyCode:null,
         offset = 3,
         pressDelay = 50,
         element = self.element

     event.preventDefault()
     switch (keyCode) {
       //Arrow left
       case 37: self.lon -= offset;
         break;
       //Arrow right
       case 39: self.lon += offset;
         break;
       //Arrow up
       case 38: self.lat += offset;
         break;
       //Arrow down
       case 40: self.lat -= offset;
         break;
     }
     setTimeout(() => {
       let pressEvent = document.createEvent('CustomEvent')
       pressEvent.initCustomEvent("keyArrowPress",true,true,{'keyCode':keyCode})
       element.dispatchEvent(pressEvent)
     },
     pressDelay)
   }
  }

  const animate = () => {
    // set our animate function to fire next time a frame is ready
    self.requestAnimationId = requestAnimationFrame(animate.bind(self))

    if(self.isVideo) {
      if ( self.video.readyState === self.video.HAVE_ENOUGH_DATA) {
        if(self.videocanvas) {
          self.videocanvas.getContext('2d').drawImage(self.video, 0, 0, self.videocanvas.width, self.videocanvas.height)
        }
        if(typeof(self.texture) !== "undefined" ) {
          let ct = new Date().getTime()
          if(ct - self.time >= 30) {
            self.texture.needsUpdate = true
            self.time = ct
          }
        }
      }
    }
    render()
  }

  const render = () => {
    self.lat = Math.max( - 85, Math.min( 85, self.lat))
    self.phi = ( 90 - self.lat ) * Math.PI / 180
    self.theta = self.lon * Math.PI / 180

    let cx = 500 * Math.sin( self.phi ) * Math.cos( self.theta ),
        cy = 500 * Math.cos( self.phi ),
        cz = 500 * Math.sin( self.phi ) * Math.sin( self.theta )

    self.camera.lookAt(new THREE.Vector3(cx, cy, cz))

    // distortion
    if(self.options.flatProjection) {
      self.camera.position.x = 0
      self.camera.position.y = 0
      self.camera.position.z = 0
    } else {
      self.camera.position.x = - cx
      self.camera.position.y = - cy
      self.camera.position.z = - cz
    }

    self.renderer.clear()
    self.renderer.render( self.scene, self.camera )
  }

  const play = () => {
    //code to play media
    self.video.play()
  }

  const pause = () => {
    //code to stop media
    self.video.pause()
  }

  const loadVideo = (videoFile) => {
    self.video.src = videoFile
  }

  const unloadVideo = () => {
    // overkill unloading to avoid dreaded video 'pending' bug in Chrome. See https://code.google.com/p/chromium/issues/detail?id=234779
    self.pause()
    self.video.src = ''
    self.video.setAttribute('src', '')
  }

  const loadPhoto = (photoFile) => {
    self.texture = THREE.ImageUtils.loadTexture( photoFile );
  }

  const resizeGL = (w, h) => {
    self.renderer.setSize(w, h)
    self.camera.aspect = w / h
    self.camera.updateProjectionMatrix()
  }

  const showWaiting = () => {
    let loading = self.element.querySelectorAll('.loading')[0]
    loading.querySelectorAll('.waiting-icon')[0].style.display = ''
    loading.querySelectorAll('.error-icon')[0].style.display = 'none'
    loading.style.display = ''
  }

  const hideWaiting = () => {
    self.element.querySelectorAll('.loading')[0].style.display = 'none'
  }

  const showError = () => {
    let loading = self.element.querySelectorAll('.loading')[0]
    loading.querySelectorAll('.waiting-icon')[0].style.display = 'none'
    loading.querySelectorAll('.error-icon').style.display = ''
    loading.style.display = ''
  }

  const destroy = () => {
    window.cancelAnimationFrame(self.requestAnimationId)
    self.requestAnimationId = ''
    self.texture.dispose()
    self.scene.parentNode.removeChild(self.mesh)
    if (self.isVideo) {
      unloadVideo()
    }
    self.renderer.parentNode.removeChild()
  }

  return {
    attachContainer,
    attachVideo
  }
}

module.exports = ThreeSixty
