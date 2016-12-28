// TODO strip out options
// TODO get rid of bind issues

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
    element.style.width = '400px'
    element.style.margin = '5em auto 0'
    if (!this.webgl) {
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
};

const ThreeSixty = (THREE, Detector, window, document, undefined) => {
  // undefined is used here as the undefined global
  // variable in ECMAScript 3 and is mutable (i.e. it can
  // be changed by someone else). undefined isn't really
  // being passed in so we can ensure that its value is
  // truly undefined. In ES5, undefined can no longer be
  // modified.

  // window and document are passed through as local
  // variables rather than as globals, because this (slightly)
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
      }

  // The actual plugin constructor
  const init = (element, options) => {
    this.element = element
    this.options = defaults
    this._defaults = defaults
    this._name = pluginName

    // Place initialization logic here
    // You already have access to the DOM element and
    // the options via the instance, e.g. this.element
    // and this.options
    // you can add more functions like the one below and
    // call them like so: this.yourOtherFunction(this.element, this.options).

    // instantiate some local variables we're going to need
    this._time = new Date().getTime()
    this._controls = {}
    this._id = generateUUID()

    this._requestAnimationId = '' // used to cancel requestAnimationFrame on destroy
    this._isVideo = false
    this._isPhoto = false
    this._isFullscreen = false
    this._mouseDown = false
    this._dragStart = {}

    this._lat = this.options.lat;
    this._lon = this.options.lon;
    this._fov = this.options.fov;

    // save our original height and width for returning from fullscreen
    this._originalWidth = this.element.querySelectorAll('canvas').offsetWidth
    this._originalHeight = this.element.querySelectorAll('canvas').offsetHeight

    // add a class to our element so it inherits the appropriate styles
    if (this.element.classList)
      this.element.classList.add('default')
    else
      this.element.className += ' ' + 'default'

    // add tabindex attribute to enable the focus on the element (required for keyboard controls)
    if(this.options.keyboardControls && !this.element.getAttribute("tabindex")) {
      this.element.setAttribute("tabindex", "1")
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
    let self = this
    // create a local THREE.js scene
    this._scene = new THREE.Scene()

    // create ThreeJS camera
    this._camera = new THREE.PerspectiveCamera(this._fov, this.element.offsetWidth / this.element.offsetHeight, 0.1, 1000)
    this._camera.setLens(this._fov)

    // create ThreeJS renderer and append it to our object
    this._renderer = Detector.webgl? new THREE.WebGLRenderer(): new THREE.CanvasRenderer()
    this._renderer.setSize(this.element.offsetWidth, this.element.offsetHeight)
    this._renderer.autoClear = false
    this._renderer.setClearColor(0x333333, 1)

    // append the rendering element to this div
    this.element.appendChild(this._renderer.domElement)

    const createAnimation = () => {
      self._texture.generateMipmaps = false
      self._texture.minFilter = THREE.LinearFilter
      self._texture.magFilter = THREE.LinearFilter
      self._texture.format = THREE.RGBFormat

      // create ThreeJS mesh sphere onto which our texture will be drawn
      self._mesh = new THREE.Mesh(new THREE.SphereGeometry( 500, 80, 50 ), new THREE.MeshBasicMaterial({map: self._texture}))
      self._mesh.scale.x = -1 // mirror the texture, since we're looking from the inside out
      self._scene.add(self._mesh)

      self.animate()
    }

    // figure out our texturing situation, based on what our source is
    if(this.element.getAttribute('data-photo-src')) {
      this._isPhoto = true;
      THREE.ImageUtils.crossOrigin = this.options.crossOrigin;
      this._texture = THREE.ImageUtils.loadTexture( $(this.element).attr('data-photo-src') );
      createAnimation();
    } else {
      this._isVideo = true;

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
      this.element.appendChild(loadingElem)
      showWaiting()

      // create off-dom video player
      this._video = document.createElement('video')
      this._video.setAttribute('crossorigin', this.options.crossOrigin)
      this._video.style.display = 'none'
      this.element.appendChild(this._video)
      this._video.loop = this.options.loop

      // attach video player event listeners
      this._video.addEventListener("ended", () => {})

      // Progress Meter
      this._video.addEventListener("progress", () => {
        let percent = null
        if (self._video && self._video.buffered && self._video.buffered.length > 0 && self._video.buffered.end && self._video.duration) {
          percent = self._video.buffered.end(0) / self._video.duration
        }
        // Some browsers (e.g., FF3.6 and Safari 5) cannot calculate target.bufferered.end()
        // to be anything other than 0. If the byte count is available we use this instead.
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
          // do something with this percentage info (cpct)
        }
      })

      // Error listener
      this._video.addEventListener('error', (event) => {
        console.error(self._video.error)
        showError()
      })

      this._video.addEventListener("timeupdate", () => {
        if (this.paused === false){
          let percent = this.currentTime * 100 / this.duration
          self.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].children[0].setAttribute("style", "width:" + percent + "%;")
          self.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].children[1].setAttribute("style", "width:" + (100 - percent) + "%;")
          //Update time label
          let durMin = Math.floor(this.duration / 60),
              durSec = Math.floor(this.duration - (durMin * 60)),
              timeMin = Math.floor(this.currentTime / 60),
              timeSec = Math.floor(this.currentTime - (timeMin * 60)),
              duration = durMin + ':' + (durSec < 10 ? '0' + durSec : durSec),
              currentTime = timeMin + ':' + (timeSec < 10 ? '0' + timeSec : timeSec)
          self.element.querySelectorAll('.controls .timeLabel').innerHTML = (currentTime + ' / ' + duration)
        }
      })

      // IE 11 and previous not supports THREE.Texture([video]), we must create a canvas that draws the video and use that to create the Texture
      var isIE = navigator.appName == 'Microsoft Internet Explorer' || !!(navigator.userAgent.match(/Trident/) || navigator.userAgent.match(/rv 11/))
      if (isIE) {
        this._videocanvas = document.createElement('canvas')
        this._texture = new THREE.Texture(this._videocanvas)
        // set canvas size = video size when known
        this._video.addEventListener('loadedmetadata', () => {
          self._videocanvas.width = self._video.videoWidth;
          self._videocanvas.height = self._video.videoHeight;
          createAnimation()
        })
      } else {
        this._texture = new THREE.Texture( this._video )
      }

      //force browser caching of the video to solve rendering errors with big videos
      let xhr = new XMLHttpRequest()
      xhr.open('GET', this.element.getAttribute('data-video-src'), true);
      xhr.responseType = 'blob'
      xhr.onload = function (e) {
        if (this.status === 200) {
          let vid = (window.webkitURL ? webkitURL : URL).createObjectURL(this.response)
          //Video Play Listener, fires after video loads
          self._video.addEventListener("canplaythrough", () => {
            if (self.options.autoplay === true) {
              self.hideWaiting()
              self.play()
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
    let playPauseControl = this.options.autoplay ? 'fa-pause' : 'fa-play',
        controlsElem = document.createElement('div'),
        timeTooltipElem = document.createElement('div')

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

    this.element.appendChild(controlsElem)

    if (timeTooltipElem.classList)
      timeTooltipElem.classList.add('timeTooltip')
    else
      timeTooltipElem.className += ' ' + 'timeTooltip'

    timeTooltipElem.innerHTML = '00:00'

    this.element.appendChild(timeTooltipElem)

    // hide controls if option is set
    if(this.options.hideControls) {
      this.element.querySelectorAll('.controls').style.display = 'none'
    }

    // wire up controller events to dom elements
    attachControlEvents()
  }

  const attachControlEvents = () => {
    // create a self var to pass to our controller functions
    var self = this

    this.element.addEventListener( 'mousemove', this.onMouseMove.bind(this), false )
    this.element.addEventListener( 'touchmove', this.onMouseMove.bind(this), false )
    this.element.addEventListener( 'mousewheel', this.onMouseWheel.bind(this), false )
    this.element.addEventListener( 'DOMMouseScroll', this.onMouseWheel.bind(this), false )
    this.element.addEventListener( 'mousedown', this.onMouseDown.bind(this), false)
    this.element.addEventListener( 'touchstart', this.onMouseDown.bind(this), false)
    this.element.addEventListener( 'mouseup', this.onMouseUp.bind(this), false)
    this.element.addEventListener( 'touchend', this.onMouseUp.bind(this), false)

    if(this.options.keyboardControls) {
      this.element.addEventListener('keydown',this.onKeyDown.bind(this), false)
      this.element.addEventListener('keyup',this.onKeyUp.bind(this), false)
      // Used custom press event because for the arrow buttons is not throws the 'keypress' event
      this.element.addEventListener('keyArrowPress',this.onKeyArrowPress.bind(this), false)
      this.element.addEventListener('click', () => {
        self.element.focus()
      },false)
    }

    self.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].addEventListener("click", this.onProgressClick.bind(this), false)
    self.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].addEventListener("mousemove", this.onProgressMouseMove.bind(this), false)
    self.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].addEventListener("mouseout", this.onProgressMouseOut.bind(this), false)

    document.addEventListener('webkitfullscreenchange mozfullscreenchange fullscreenchange MSFullscreenChange',this.fullscreen.bind(this));

    window.onresize = () => {
      self.resizeGL(self.element.offsetWidth, self.element.offsetHeight)
    }
  }

  const attachControlEvents = () => {
    // create a self var to pass to our controller functions
    var self = this

    this.element.addEventListener( 'mousemove', this.onMouseMove.bind(this), false )
    this.element.addEventListener( 'touchmove', this.onMouseMove.bind(this), false )
    this.element.addEventListener( 'mousewheel', this.onMouseWheel.bind(this), false )
    this.element.addEventListener( 'DOMMouseScroll', this.onMouseWheel.bind(this), false )
    this.element.addEventListener( 'mousedown', this.onMouseDown.bind(this), false)
    this.element.addEventListener( 'touchstart', this.onMouseDown.bind(this), false)
    this.element.addEventListener( 'mouseup', this.onMouseUp.bind(this), false)
    this.element.addEventListener( 'touchend', this.onMouseUp.bind(this), false)

    if(this.options.keyboardControls) {
      this.element.addEventListener('keydown',this.onKeyDown.bind(this), false)
      this.element.addEventListener('keyup',this.onKeyUp.bind(this), false)
      // Used custom press event because for the arrow buttons is not throws the 'keypress' event
      this.element.addEventListener('keyArrowPress',this.onKeyArrowPress.bind(this), false)
      this.element.addEventListener('click', () => {
        self.element.focus()
      },false)
    }

    self.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].addEventListener("click", this.onProgressClick.bind(this), false)
    self.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].addEventListener("mousemove", this.onProgressMouseMove.bind(this), false)
    self.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].addEventListener("mouseout", this.onProgressMouseOut.bind(this), false)

    document.addEventListener('webkitfullscreenchange mozfullscreenchange fullscreenchange MSFullscreenChange',this.fullscreen.bind(this));

    window.onresize = () => {
      self.resizeGL(self.element.offsetWidth, self.element.offsetHeight)
    }
  }

  const onMouseMov = (event) => {
    this._onPointerDownPointerX = event.clientX
    this._onPointerDownPointerY = -event.clientY

    let rect = this.element.querySelectorAll('canvas')[0].getBoundingClientRect()
    this.relativeX = event.pageX - rect.left

    this._onPointerDownLon = this._lon
    this._onPointerDownLat = this._lat

    let x, y

    if(this.options.clickAndDrag) {
      if(this._mouseDown) {
        x = event.pageX - this._dragStart.x
        y = event.pageY - this._dragStart.y
        this._dragStart.x = event.pageX
        this._dragStart.y = event.pageY
        this._lon += x
        this._lat -= y
      }
    } else {
      x = event.pageX - rect.left
      y = event.pageY - rect.top

      this._lon = ( x / this.element.querySelectorAll('canvas')[0].offsetWidth ) * 430 - 225
      this._lat = ( y / this.element.querySelectorAll('canvas')[0].offsetHeight ) * -180 + 90
    }
  }

  const onMouseWheel = (event) => {
    let wheelSpeed = -0.01

    // WebKit
    if (event.wheelDeltaY) {
      this._fov -= event.wheelDeltaY * wheelSpeed
    // Opera / Explorer 9
    } else if (event.wheelDelta) {
      this._fov -= event.wheelDelta * wheelSpeed
    // Firefox
    } else if (event.detail) {
      this._fov += event.detail * 1.0
    }

    if(this._fov < this.options.fovMin) {
      this._fov = this.options.fovMin
    } else if(this._fov > this.options.fovMax) {
      this._fov = this.options.fovMax
    }

    this._camera.setLens(this._fov)
    event.preventDefault()
  }

  const onMouseDown = (event) => {
    this._mouseDown = true
    this._dragStart.x = event.pageX
    this._dragStart.y = event.pageY
  }

  const onMouseDown = (event) => {
    this._mouseDown = true
    this._dragStart.x = event.pageX
    this._dragStart.y = event.pageY
  }

  const onMouseDown = (event) => {
    this._mouseDown = true
    this._dragStart.x = event.pageX
    this._dragStart.y = event.pageY
  }

  const onProgressClick = (event) => {
    if(this._isVideo && this._video.readyState === this._video.HAVE_ENOUGH_DATA) {
      let percent =  this.relativeX / $(this.element).find('canvas').width() * 100
      this.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].children[0].setAttribute("style", "width:" + percent + "%;")
      this.element.querySelectorAll('.controlsWrapper > .progress-bar')[0].children[1].setAttribute("style", "width:" + (100 - percent) + "%;")
      this._video.currentTime = this._video.duration * percent / 100
    }
  }

  const onProgressMouseMove = (event) => {
    let percent =  this.relativeX / this.element.querySelectorAll('canvas').offsetWidth * 100
    if (percent) {
      let tooltip = this.element.querySelectorAll('.timeTooltip'),
          tooltipLeft = (this.relativeX - (tooltip.width()/2))
      tooltipLeft = tooltipLeft <0? 0:Math.min(tooltipLeft,this.element.querySelectorAll('canvas').offsetWidth - tooltip.offsetWidth);
      tooltip.style.left = tooltipLeft + 'px'
      tooltip.style.display = ''

      let time = (percent / 100) * this._video.duration,
          timeMin = Math.floor(time / 60),
          timeSec = Math.floor(time - (timeMin * 60))
      tooltip.innerHTML = (timeMin + ':' + (timeSec < 10 ? '0' + timeSec : timeSec))
    }
  }

  const onProgressMouseOut = (event) => {
    this.element.querySelectorAll('.timeTooltip').style.display = 'none'
  }

  const onMouseUp = (event) => {
    this._mouseDown = false
  }

  const onKeyDown = (event) => {
   let keyCode = event.keyCode
   if (keyCode >= 37 && keyCode <= 40) {
     event.preventDefault()
     this._keydown = true
     let pressEvent = document.createEvent('CustomEvent')
     pressEvent.initCustomEvent("keyArrowPress",true,true,{'keyCode':keyCode})
     this.element.dispatchEvent(pressEvent)
   }
  }

  const onKeyUp = (event) => {
   let keyCode = event.keyCode;
   if (keyCode >= 37 && keyCode <= 40) {
     event.preventDefault()
     this._keydown = false
   }
  }

  const onKeyArrowPress = (event) => {
   if (this._keydown) {
     let keyCode = event.detail? event.detail.keyCode:null,
         offset = 3,
         pressDelay = 50,
         element = this.element

     event.preventDefault()
     switch (keyCode) {
       //Arrow left
       case 37: this._lon -= offset;
         break;
       //Arrow right
       case 39: this._lon += offset;
         break;
       //Arrow up
       case 38: this._lat += offset;
         break;
       //Arrow down
       case 40: this._lat -= offset;
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
    this._requestAnimationId = requestAnimationFrame(this.animate.bind(this))

    if(this._isVideo) {
      if ( this._video.readyState === this._video.HAVE_ENOUGH_DATA) {
        if(this._videocanvas) {
          this._videocanvas.getContext('2d').drawImage(this._video, 0, 0, this._videocanvas.width, this._videocanvas.height)
        }
        if(typeof(this._texture) !== "undefined" ) {
          let ct = new Date().getTime()
          if(ct - this._time >= 30) {
            this._texture.needsUpdate = true
            this._time = ct
          }
        }
      }
    }
    render()
  }

  const render = () => {
    this._lat = Math.max( - 85, Math.min( 85, this._lat))
    this._phi = ( 90 - this._lat ) * Math.PI / 180
    this._theta = this._lon * Math.PI / 180

    let cx = 500 * Math.sin( this._phi ) * Math.cos( this._theta ),
        cy = 500 * Math.cos( this._phi ),
        cz = 500 * Math.sin( this._phi ) * Math.sin( this._theta )

    this._camera.lookAt(new THREE.Vector3(cx, cy, cz))

    // distortion
    if(this.options.flatProjection) {
      this._camera.position.x = 0
      this._camera.position.y = 0
      this._camera.position.z = 0
    } else {
      this._camera.position.x = - cx
      this._camera.position.y = - cy
      this._camera.position.z = - cz
    }

    this._renderer.clear()
    this._renderer.render( this._scene, this._camera )
  }

  const play = () => {
    //code to play media
    this._video.play()
  }

  const pause = () => {
    //code to stop media
    this._video.pause()
  }

  const loadVideo = (videoFile) => {
    this._video.src = videoFile
  }

  const unloadVideo = () => {
    // overkill unloading to avoid dreaded video 'pending' bug in Chrome. See https://code.google.com/p/chromium/issues/detail?id=234779
    this.pause()
    this._video.src = ''
    this._video.setAttribute('src', '')
  }

  const loadPhoto = (photoFile) => {
    this._texture = THREE.ImageUtils.loadTexture( photoFile );
  }

  const resizeGL = (w, h) => {
    this._renderer.setSize(w, h)
    this._camera.aspect = w / h
    this._camera.updateProjectionMatrix()
  }

  const showWaiting = () => {
    let loading = this.element.querySelectorAll('.loading')[0]
    loading.querySelectorAll('.waiting-icon')[0].style.display = ''
    loading.querySelectorAll('.error-icon')[0].style.display = 'none'
    loading.style.display = ''
  }

  const hideWaiting = () => {
    this.element.querySelectorAll('.loading')[0].style.display = 'none'
  }

  const showError = () => {
    let loading = this.element.querySelectorAll('.loading')[0]
    loading.querySelectorAll('.waiting-icon')[0].style.display = 'none'
    loading.querySelectorAll('.error-icon').style.display = ''
    loading.style.display = ''
  }

  const destroy = () => {
    window.cancelAnimationFrame(this._requestAnimationId)
    this._requestAnimationId = ''
    this._texture.dispose()
    this._scene.parentNode.removeChild(this._mesh)
    if (this._isVideo) {
      unloadVideo()
    }
    this._renderer.parentNode.removeChild()
  }

  return {
    init
  }
}

module.exports = ThreeSixty
