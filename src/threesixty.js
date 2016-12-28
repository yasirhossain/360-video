// TODO strip out options
// TODO get rid of bind issues
const ThreeSixty = (THREE, Detector, window, document, undefined) => {
  // undefined is used here as the undefined global
  // variable in ECMAScript 3 and is mutable (i.e. it can
  // be changed by someone else). undefined isn't really
  // being passed in so we can ensure that its value is
  // truly undefined. In ES5, undefined can no longer be
  // modified.

  // window and document are passed through as local
  // variables rather than as globals, because self (slightly)
  // quickens the resolution process and can be more
  // efficiently minified (especially when both are
  // regularly referenced in your plugin).

  // Create the defaults once
  let pluginName = "threesixty",
      plugin, // will hold reference to instantiated Plugin
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
      self = {}

  // The actual plugin constructor
  const attach = (element) => {
    self.element = element
    self.options = defaults
    self._defaults = defaults
    self._name = pluginName

    // Place initialization logic here
    // You already have access to the DOM element and
    // the options via the instance, e.g. self.element
    // and self.options
    // you can add more functions like the one below and
    // call them like so: self.yourOtherFunction(self.element, self.options).

    // instantiate some local variables we're going to need
    self._time = new Date().getTime()
    self._controls = {}
    self._id = generateUUID()

    self._requestAnimationId = '' // used to cancel requestAnimationFrame on destroy
    self._isVideo = false
    self._isPhoto = false
    self._isFullscreen = false
    self._mouseDown = false
    self._dragStart = {}

    self._lat = self.options.lat;
    self._lon = self.options.lon;
    self._fov = self.options.fov;

    // save our original height and width for returning from fullscreen
    self._originalWidth = self.element.querySelectorAll('canvas').offsetWidth
    self._originalHeight = self.element.querySelectorAll('canvas').offsetHeight

    // add a class to our element so it inherits the appropriate styles
    if (self.element.classList)
      self.element.classList.add('default')
    else
      self.element.className += ' ' + 'default'

    // add tabindex attribute to enable the focus on the element (required for keyboard controls)
    if(self.options.keyboardControls && !self.element.getAttribute("tabindex")) {
      self.element.setAttribute("tabindex", "1")
    }

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
    self._scene = new THREE.Scene()

    // create ThreeJS camera
    self._camera = new THREE.PerspectiveCamera(self._fov, self.element.offsetWidth / self.element.offsetHeight, 0.1, 1000)
    self._camera.setLens(self._fov)

    // create ThreeJS renderer and append it to our object
    self._renderer = Detector.webgl? new THREE.WebGLRenderer(): new THREE.CanvasRenderer()
    self._renderer.setSize(self.element.offsetWidth, self.element.offsetHeight)
    self._renderer.autoClear = false
    self._renderer.setClearColor(0x333333, 1)

    // append the rendering element to self div
    self.element.appendChild(self._renderer.domElement)

    const createAnimation = () => {
      self._texture.generateMipmaps = false
      self._texture.minFilter = THREE.LinearFilter
      self._texture.magFilter = THREE.LinearFilter
      self._texture.format = THREE.RGBFormat

      // create ThreeJS mesh sphere onto which our texture will be drawn
      self._mesh = new THREE.Mesh(new THREE.SphereGeometry( 500, 80, 50 ), new THREE.MeshBasicMaterial({map: self._texture}))
      self._mesh.scale.x = -1 // mirror the texture, since we're looking from the inside out
      self._scene.add(self._mesh)

      animate()
    }

    // figure out our texturing situation, based on what our source is
    if(self.element.getAttribute('data-photo-src')) {
      self._isPhoto = true
      THREE.ImageUtils.crossOrigin = self.options.crossOrigin
      self._texture = THREE.ImageUtils.loadTexture(self.element.getAttribute('data-photo-src'))
      createAnimation()
    } else {
      self._isVideo = true

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

      // create off-dom video player
      self._video = document.createElement('video')
      self._video.setAttribute('crossorigin', self.options.crossOrigin)
      self._video.style.display = 'none'
      self.element.appendChild(self._video)
      self._video.loop = self.options.loop

      // attach video player event listeners
      self._video.addEventListener("ended", () => {})

      // Progress Meter
      self._video.addEventListener("progress", () => {
        let percent = null
        if (self._video && self._video.buffered && self._video.buffered.length > 0 && self._video.buffered.end && self._video.duration) {
          percent = self._video.buffered.end(0) / self._video.duration
        }
        // Some browsers (e.g., FF3.6 and Safari 5) cannot calculate target.bufferered.end()
        // to be anything other than 0. If the byte count is available we use self instead.
        // Browsers that support the else if do not seem to have the bufferedBytes value and
        // should skip to there. Tested in Safari 5, Webkit head, FF3.6, Chrome 6, IE 7/8.
        else if (self._video && self._video.bytesTotal !== undefined && self._video.bytesTotal > 0 && self._video.bufferedBytes !== undefined) {
          percent = self._video.bufferedBytes / self._video.bytesTotal
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
      self._video.addEventListener('error', (event) => {
        console.error(self._video.error)
        showError()
      })

      self._video.addEventListener("timeupdate", () => {
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
        self._videocanvas = document.createElement('canvas')
        self._texture = new THREE.Texture(self._videocanvas)
        // set canvas size = video size when known
        self._video.addEventListener('loadedmetadata', () => {
          self._videocanvas.width = self._video.videoWidth;
          self._videocanvas.height = self._video.videoHeight;
          createAnimation()
        })
      } else {
        self._texture = new THREE.Texture( self._video )
      }

      //force browser caching of the video to solve rendering errors with big videos
      let xhr = new XMLHttpRequest()
      xhr.open('GET', self.element.getAttribute('data-video-src'), true)
      xhr.responseType = 'blob'
      xhr.onload = function (e) {
        if (e.srcElement.status === 200) {
          let vid = (window.webkitURL ? webkitURL : URL).createObjectURL(e.srcElement.response)
          //Video Play Listener, fires after video loads
          self._video.addEventListener("canplaythrough", () => {
            if (self.options.autoplay === true) {
              hideWaiting()
              play()
              self._videoReady = true
            }
          })

          // set the video src and begin loading
          self._video.src = vid
        }
      };

      xhr.onreadystatechange = (oEvent) => {
        if (xhr.readyState === 4) {
          if (xhr.status !== 200) {
            console.error('Video error: status ' + xhr.status)
            self.showError()
          }
        }
      }
      xhr.send()

      if(!isIE) createAnimation()
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
      self.resizeGL(self.element.offsetWidth, self.element.offsetHeight)
    }
  }

  const onMouseMove = (event) => {
    self._onPointerDownPointerX = event.clientX
    self._onPointerDownPointerY = -event.clientY

    let rect = self.element.querySelectorAll('canvas')[0].getBoundingClientRect()
    self.relativeX = event.pageX - rect.left

    self._onPointerDownLon = self._lon
    self._onPointerDownLat = self._lat

    let x, y

    if(self.options.clickAndDrag) {
      if(self._mouseDown) {
        x = event.pageX - self._dragStart.x
        y = event.pageY - self._dragStart.y
        self._dragStart.x = event.pageX
        self._dragStart.y = event.pageY
        self._lon += x
        self._lat -= y
      }
    } else {
      x = event.pageX - rect.left
      y = event.pageY - rect.top

      self._lon = ( x / self.element.querySelectorAll('canvas')[0].offsetWidth ) * 430 - 225
      self._lat = ( y / self.element.querySelectorAll('canvas')[0].offsetHeight ) * -180 + 90
    }
  }

  const onMouseWheel = (event) => {
    let wheelSpeed = -0.01

    // WebKit
    if (event.wheelDeltaY) {
      self._fov -= event.wheelDeltaY * wheelSpeed
    // Opera / Explorer 9
    } else if (event.wheelDelta) {
      self._fov -= event.wheelDelta * wheelSpeed
    // Firefox
    } else if (event.detail) {
      self._fov += event.detail * 1.0
    }

    if(self._fov < self.options.fovMin) {
      self._fov = self.options.fovMin
    } else if(self._fov > self.options.fovMax) {
      self._fov = self.options.fovMax
    }

    self._camera.setLens(self._fov)
    event.preventDefault()
  }

  const onMouseDown = (event) => {
    self._mouseDown = true
    self._dragStart.x = event.pageX
    self._dragStart.y = event.pageY
  }

  const onProgressClick = (event) => {
    if(self._isVideo && self._video.readyState === self._video.HAVE_ENOUGH_DATA) {
      let percent =  self.relativeX / self.element.querySelectorAll('canvas').offsetWidth * 100
      self.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].children[0].setAttribute("style", "width:" + percent + "%;")
      self.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].children[1].setAttribute("style", "width:" + (100 - percent) + "%;")
      self._video.currentTime = self._video.duration * percent / 100
    }
  }

  const onMouseUp = (event) => {
    self._mouseDown = false
  }

  const onKeyDown = (event) => {
   let keyCode = event.keyCode
   if (keyCode >= 37 && keyCode <= 40) {
     event.preventDefault()
     self._keydown = true
     let pressEvent = document.createEvent('CustomEvent')
     pressEvent.initCustomEvent("keyArrowPress",true,true,{'keyCode':keyCode})
     self.element.dispatchEvent(pressEvent)
   }
  }

  const onKeyUp = (event) => {
   let keyCode = event.keyCode;
   if (keyCode >= 37 && keyCode <= 40) {
     event.preventDefault()
     self._keydown = false
   }
  }

  const onKeyArrowPress = (event) => {
   if (self._keydown) {
     let keyCode = event.detail? event.detail.keyCode:null,
         offset = 3,
         pressDelay = 50,
         element = self.element

     event.preventDefault()
     switch (keyCode) {
       //Arrow left
       case 37: self._lon -= offset;
         break;
       //Arrow right
       case 39: self._lon += offset;
         break;
       //Arrow up
       case 38: self._lat += offset;
         break;
       //Arrow down
       case 40: self._lat -= offset;
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
    self._requestAnimationId = requestAnimationFrame(animate.bind(self))

    if(self._isVideo) {
      if ( self._video.readyState === self._video.HAVE_ENOUGH_DATA) {
        if(self._videocanvas) {
          self._videocanvas.getContext('2d').drawImage(self._video, 0, 0, self._videocanvas.width, self._videocanvas.height)
        }
        if(typeof(self._texture) !== "undefined" ) {
          let ct = new Date().getTime()
          if(ct - self._time >= 30) {
            self._texture.needsUpdate = true
            self._time = ct
          }
        }
      }
    }
    render()
  }

  const render = () => {
    self._lat = Math.max( - 85, Math.min( 85, self._lat))
    self._phi = ( 90 - self._lat ) * Math.PI / 180
    self._theta = self._lon * Math.PI / 180

    let cx = 500 * Math.sin( self._phi ) * Math.cos( self._theta ),
        cy = 500 * Math.cos( self._phi ),
        cz = 500 * Math.sin( self._phi ) * Math.sin( self._theta )

    self._camera.lookAt(new THREE.Vector3(cx, cy, cz))

    // distortion
    if(self.options.flatProjection) {
      self._camera.position.x = 0
      self._camera.position.y = 0
      self._camera.position.z = 0
    } else {
      self._camera.position.x = - cx
      self._camera.position.y = - cy
      self._camera.position.z = - cz
    }

    self._renderer.clear()
    self._renderer.render( self._scene, self._camera )
  }

  const play = () => {
    //code to play media
    self._video.play()
  }

  const pause = () => {
    //code to stop media
    self._video.pause()
  }

  const loadVideo = (videoFile) => {
    self._video.src = videoFile
  }

  const unloadVideo = () => {
    // overkill unloading to avoid dreaded video 'pending' bug in Chrome. See https://code.google.com/p/chromium/issues/detail?id=234779
    self.pause()
    self._video.src = ''
    self._video.setAttribute('src', '')
  }

  const loadPhoto = (photoFile) => {
    self._texture = THREE.ImageUtils.loadTexture( photoFile );
  }

  const resizeGL = (w, h) => {
    self._renderer.setSize(w, h)
    self._camera.aspect = w / h
    self._camera.updateProjectionMatrix()
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
    window.cancelAnimationFrame(self._requestAnimationId)
    self._requestAnimationId = ''
    self._texture.dispose()
    self._scene.parentNode.removeChild(self._mesh)
    if (self._isVideo) {
      unloadVideo()
    }
    self._renderer.parentNode.removeChild()
  }

  return {
    attach
  }
}

module.exports = ThreeSixty
