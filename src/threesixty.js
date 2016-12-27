import THREE from './three'

const ThreeSixty = () => {
  let element,
      video,
      object,
      Detector,
      document,
      window,
      pluginName = "Valiant360",
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
          muted: true,
          volume: 0.5,
          debug: false,
          flatProjection: false,
          autoplay: true
      }

  const extend = (out) => {
    out = out || {}

    for (var i = 1; i < arguments.length; i++) {
      if (!arguments[i])
        continue

      for (var key in arguments[i]) {
        if (arguments[i].hasOwnProperty(key))
          out[key] = arguments[i][key]
      }
    }

    return out
  }

  const generateUUID = () => {
    var d = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random()*16)%16 | 0;
        d = Math.floor(d/16);
        return (c==='x' ? r : (r&0x7|0x8)).toString(16);
    });
    return uuid;
  }

  const createMediaPlayer = () => {
    // make a self reference we can pass to our callbacks
    let self = object

    // create a local THREE.js scene
    object.scene = new THREE.Scene()

    // create ThreeJS camera
    object.camera = new THREE.PerspectiveCamera(object.fov, element.width / element.height, 0.1, 1000)
    object.camera.setLens(object.fov)

    // create ThreeJS renderer and append it to our object
    object.renderer = Detector.webgl? new THREE.WebGLRenderer(): new THREE.CanvasRenderer()
    object.renderer.setSize( element.width, element.height )
    object.renderer.autoClear = false
    object.renderer.setClearColor( 0x333333, 1 )

    // append the rendering element to this div
    element.appendChild(object.renderer.domElement)

    let createAnimation = () => {
      self.texture.generateMipmaps = false
      self.texture.minFilter = THREE.LinearFilter
      self.texture.magFilter = THREE.LinearFilter
      self.texture.format = THREE.RGBFormat

      // create ThreeJS mesh sphere onto which our texture will be drawn
      self.mesh = new THREE.Mesh(new THREE.SphereGeometry( 500, 80, 50 ), new THREE.MeshBasicMaterial({ map: self.texture }))
      self.mesh.scale.x = -1 // mirror the texture, since we're looking from the inside out
      self.scene.add(self.mesh)

      animate()
    }

    // figure out our texturing situation, based on what our source is
    if(element.getAttribute('data-photo-src')) {
      object.isPhoto = true
      THREE.ImageUtils.crossOrigin = object.options.crossOrigin
      object.texture = THREE.ImageUtils.loadTexture(element.getAttribute('data-photo-src'))
      createAnimation()
    } else
      object.isVideo = true

    // create loading overlay
    const loadingHTML =
      `<div class="loading">
        <div class="icon waiting-icon"></div>
        <div class="icon error-icon"><i class="fa fa-exclamation-triangle" aria-hidden="true"></i></div>
      </div>`

    element.innerHTML += loadingHTML
    showWaiting()

    // create off-dom video player
    //object.video = `<video style="display: none;"></video>`
    //object.video.setAttribute('crossorigin', object.options.crossOrigin)
    //element.innerHTML += object.video
    //object.video.loop = object.options.loop
    //object.video.muted = object.options.muted
    //object.video.volume = object.options.volume

    //force browser caching of the video to solve rendering errors with big videos
    let request = new XMLHttpRequest()
    request.open('GET', element.getAttribute('data-video-src'), true)

    request.onload = (e) => {
      if (request.status >= 200 && request.status < 400) {
        object.video = `<video crossorigin="anonymous" src="${request.responseURL}"></video>`
        element.innerHTML += object.video
        video = element.querySelectorAll('video')[0]

        //Video Play Listener, fires after video loads
        video.addEventListener("canplaythrough", () => {
          console.log(request)
          console.log(self)
          if (self.options.autoplay === true) {
            self.hideWaiting();
            self.play();
            self.videoReady = true;
          }
        });

        // Error listener
        video.addEventListener('error', (event) => {
          console.error(self.video.error);
          self.showError();
        });

        video.addEventListener("timeupdate", () => {
          if (object.paused === false) {
            let percent = object.currentTime * 100 / object.duration;

            element.querySelectorAll('valiant-progress-bar')[0].children[0].setAttribute("style", "width:" + percent + "%;");
            element.querySelectorAll('.valiant-progress-bar')[0].children[1].setAttribute("style", "width:" + (100 - percent) + "%;");
            //Update time label
            let durMin = Math.floor(object.duration / 60);
            let durSec = Math.floor(object.duration - (durMin * 60));
            let timeMin = Math.floor(object.currentTime / 60);
            let timeSec = Math.floor(object.currentTime - (timeMin * 60));
            let duration = durMin + ':' + (durSec < 10 ? '0' + durSec : durSec);
            let currentTime = timeMin + ':' + (timeSec < 10 ? '0' + timeSec : timeSec);
            element.querySelectorAll('.controls .timeLabel')[0].innerHTML = (currentTime+' / '+ duration);
          }
        });

        // attach video player event listeners
        video.addEventListener("ended", () => {})

        // Progress Meter
        video.addEventListener("progress", () => {
          let percent = null

          if (self.video && self.video.buffered && self.video.buffered.length > 0 && self.video.buffered.end && self.video.duration)
            percent = self.video.buffered.end(0) / self._ideo.duration

          // Some browsers (e.g., FF3.6 and Safari 5) cannot calculate target.bufferered.end()
          // to be anything other than 0. If the byte count is available we use this instead.
          // Browsers that support the else if do not seem to have the bufferedBytes value and
          // should skip to there. Tested in Safari 5, Webkit head, FF3.6, Chrome 6, IE 7/8.
          else if (self.video && self.video.bytesTotal !== undefined && self.video.bytesTotal > 0 && self.video.bufferedBytes !== undefined) {
            percent = self.video.bufferedBytes / self.video.bytesTotal
          }

          // Someday we can have a loading animation for videos
          const cpct = Math.round(percent * 100)

          if (cpct === 100) {
            // do something now that we are done
          } else {
            // do something with this percentage info (cpct)
          }
        });

        // IE 11 and previous not supports THREE.Texture([video]), we must create a canvas that draws the video and use that to create the Texture
        const isIE = navigator.appName ==  'Microsoft Internet Explorer' || !!(navigator.userAgent.match(/Trident/) || navigator.userAgent.match(/rv 11/));
        if (isIE) {
          //object.videocanvas = `<canvas></canvas>`
          object.texture = new THREE.Texture(object.videocanvas);
          // set canvas size = video size when known
          video.addEventListener('loadedmetadata', function () {
            //self.videocanvas.width = self.video.videoWidth;
            //self.videocanvas.height = self.video.videoHeight;
            createAnimation();
          });
        } else {
          object.texture = new THREE.Texture(object.video);
        }

        if(!isIE) {
          createAnimation();
        }
        // set the video src and begin loading
      }
    };

    request.onreadystatechange = function (oEvent) {
      if (request.readyState === 4) {
        if (request.status !== 200) {
          console.error('Video error: status ' + request.status);
          self.showError();
        }
      }
    };

    request.send();
  }

  // creates div and buttons for onscreen video controls
  const createControls = () => {
    let muteControl = object.options.muted ? 'fa-volume-off' : 'fa-volume-up',
        playPauseControl = object.options.autoplay ? 'fa-pause' : 'fa-play'

    const controlsHTML = `
      <div class="controlsWrapper">
        <div class="valiant-progress-bar">
          <div style="width: 0;"></div>
          <div style="width: 100%;"></div>
        </div>
        <div class="controls">
          <a href="#" class="playButton button fa '+ playPauseControl +'"></a>
          <div class="audioControl">
            <a href="#" class="muteButton button fa '+ muteControl +'"></a>
            <div class="volumeControl">
              <div class="volumeBar">
                <div class="volumeProgress"></div>
                <div class="volumeCursor"></div>
              </div>
            </div>
          </div>
          <span class="timeLabel"></span>
          <a href="#" class="fullscreenButton button fa fa-expand"></a>
        </div>
      </div>`

    element.innerHTML += controlsHTML

    // hide controls if option is set
    if(object.options.hideControls) {
      element.querySelectorAll('.controls')[0].style.display = 'none'
    }

    // wire up controller events to dom elements
    attachControlEvents()
  }

  const attachControlEvents = () => {
    // create a self var to pass to our controller functions
    let self = object

    element.addEventListener( 'mousemove', onMouseMove.bind(element), false );
    element.addEventListener( 'touchmove', onMouseMove.bind(element), false );
    element.addEventListener( 'mousewheel', onMouseWheel.bind(element), false );
    element.addEventListener( 'DOMMouseScroll', onMouseWheel.bind(element), false );
    element.addEventListener( 'mousedown', onMouseDown.bind(element), false);
    element.addEventListener( 'touchstart', onMouseDown.bind(element), false);
    element.addEventListener( 'mouseup', onMouseUp.bind(element), false);
    element.addEventListener( 'touchend', onMouseUp.bind(element), false);

    if(object.options.keyboardControls){
      element.addEventListener('keydown',onKeyDown.bind(element), false)
      element.addEventListener('keyup', onKeyUp.bind(element), false)
      // Used custom press event because for the arrow buttons is not throws the 'keypress' event
      element.addEventListener('keyArrowPress', onKeyArrowPress.bind(element), false)
      element.addEventListener('click', () => {
        element.focus()
      },false)
    }

    element.querySelectorAll('.valiant-progress-bar')[0].addEventListener("click", onProgressClick.bind(this), false)
    element.querySelectorAll('.valiant-progress-bar')[0].addEventListener("mousemove", onProgressMouseMove.bind(this), false)
    element.querySelectorAll('.valiant-progress-bar')[0].addEventListener("mouseout", onProgressMouseOut.bind(this), false)
  }

  const onMouseMove = (event) => {
    object.onPointerDownPointerX = event.clientX;
    object.onPointerDownPointerY = -event.clientY;

    //object.relativeX = event.pageX - element.querySelectorAll('canvas')[0].offset().left;
    object.relativeX = event.pageX

    object.onPointerDownLon = object.lon;
    object.onPointerDownLat = object.lat;

    let x, y

    if(object.options.clickAndDrag) {
      if(mouseDown) {
        x = event.pageX - object.dragStart.x;
        y = event.pageY - object.dragStart.y;
        object.dragStart.x = event.pageX;
        object.dragStart.y = event.pageY;
        object.lon += x;
        object.lat -= y;
      }
    } else {
      //let rect = element.querySelectorAll('canvas')[0].getBoundingClientRect()
      //x = event.pageX - rect.left + document.body.scrollLeft
      // y = event.pageY - rect.top + document.body.scrollTop

      x = event.pageX
      y = event.pageY

      object.lon = ( x / element.querySelectorAll('canvas')[0].width) * 430 - 225;
      object.lat = ( y / element.querySelectorAll('canvas')[0].height) * -180 + 90;
    }
  }

  const onMouseWheel = (event) => {
    var wheelSpeed = -0.01;

    // WebKit
    if ( event.wheelDeltaY ) {
      this._fov -= event.wheelDeltaY * wheelSpeed;
    // Opera / Explorer 9
    } else if ( event.wheelDelta ) {
      this._fov -= event.wheelDelta * wheelSpeed;
    // Firefox
    } else if ( event.detail ) {
      this._fov += event.detail * 1.0;
    }

    if(this._fov < this.options.fovMin) {
      this._fov = this.options.fovMin;
    } else if(this._fov > this.options.fovMax) {
      this._fov = this.options.fovMax;
    }

    this._camera.setLens(this._fov);
    event.preventDefault();
  }

  const onMouseDown = (event) => {
    object.mouseDown = true
    object.dragStart.x = event.pageX
    object.dragStart.y = event.pageY
  }

  const onProgressClick = (event) => {
    if(this._isVideo && this._video.readyState === this._video.HAVE_ENOUGH_DATA) {
      var percent =  this.relativeX / $(this.element).find('canvas').width() * 100;
      $(this.element).find('.controlsWrapper > .valiant-progress-bar')[0].children[0].setAttribute("style", "width:" + percent + "%;");
      $(this.element).find('.controlsWrapper > .valiant-progress-bar')[0].children[1].setAttribute("style", "width:" + (100 - percent) + "%;");
      this._video.currentTime = this._video.duration * percent / 100;
    }
  }

  const onProgressMouseMove = (event) => {
    var percent =  this.relativeX / $(this.element).find('canvas').width() * 100;
    if(percent){
      var tooltip = $(this.element).find('.timeTooltip');
      var tooltipLeft = (this.relativeX - (tooltip.width()/2));
      tooltipLeft = tooltipLeft <0? 0:Math.min(tooltipLeft,$(this.element).find('canvas').width() - tooltip.outerWidth());
      tooltip.css({ left: tooltipLeft + 'px' });
      tooltip.show();
      var time = (percent / 100) * this._video.duration;
      var timeMin = Math.floor(time / 60);
      var timeSec = Math.floor(time - (timeMin * 60));
      tooltip.html(timeMin + ':' + (timeSec < 10 ? '0' + timeSec : timeSec));
    }
  }

  const onProgressMouseOut = (event) => {
    $(this.element).find('.timeTooltip').hide();
  }

  const onMouseUp = (event) => {
    object.mouseDown = false;
  }

  const onKeyDown = (event) => {
   var keyCode = event.keyCode;
   if (keyCode >= 37 && keyCode <= 40) {
     event.preventDefault();
     this._keydown = true;
     var pressEvent = document.createEvent('CustomEvent');
     pressEvent.initCustomEvent("keyArrowPress",true,true,{'keyCode':keyCode});
     this.element.dispatchEvent(pressEvent);
   }
  }

  const onKeyUp = (event) => {
   var keyCode = event.keyCode;
   if (keyCode >= 37 && keyCode <= 40) {
     event.preventDefault();
     this._keydown = false;
   }
  }

  const onKeyArrowPress = (event) => {
   if (this._keydown) {
     var keyCode = event.detail? event.detail.keyCode:null;
     var offset = 3;
     var pressDelay = 50;
     var element = this.element;
     event.preventDefault();
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
     setTimeout(function () {
       var pressEvent = document.createEvent('CustomEvent');
       pressEvent.initCustomEvent("keyArrowPress",true,true,{'keyCode':keyCode});
       element.dispatchEvent(pressEvent);
     },
     pressDelay);
   }
  }

  const animate = () => {
    // set our animate function to fire next time a frame is ready
    // object.requestAnimationId = requestAnimationFrame(object.animate.bind(object));

    if(object.isVideo) {
      console.log(object.isVideo)
      console.log(video.readyState)
      if (video.readyState === 4) {
        if(object.videocanvas) {
          //console.log(object.videocanvas)
          //element.innerHTML += object.videocanvas
          //let canvas = element.querySelectorAll('canvas')[0]
          //canvas.getContext('2d').drawImage(video, 0, 0, object.videocanvas.width, object.videocanvas.height);
        }
        if(typeof(object.texture) !== "undefined" ) {
          let ct = new Date().getTime()
          if(ct - object.time >= 30) {
            object.texture.needsUpdate = true
            object.time = ct

          }
        }
      }
    }

    render()
  }

  const render = () => {
    object.lat = Math.max( - 85, Math.min( 85, object.lat ) );
    object.phi = ( 90 - object.lat ) * Math.PI / 180;
    object.theta = object.lon * Math.PI / 180;

    let cx = 500 * Math.sin( object.phi ) * Math.cos( object.theta ),
        cy = 500 * Math.cos( object.phi ),
        cz = 500 * Math.sin( object.phi ) * Math.sin( object.theta )

    object.camera.lookAt(new THREE.Vector3(cx, cy, cz))

    // distortion
    if(object.options !== undefined) {
    //if(object.options.flatProjection !== undefined) {
      object.camera.position.x = 0
      object.camera.position.y = 0
      object.camera.position.z = 0
    } else {
      object.camera.position.x = - cx
      object.camera.position.y = - cy
      object.camera.position.z = - cz
    }

    object.renderer.clear()
    object.renderer.render(object.scene, object.camera)
  }

  // Video specific functions, exposed to controller
  const play = () => {
    //code to play media
    video.play();
  }

  const pause = () => {
    //code to stop media
    video.pause();
  }

  const loadVideo = (videoFile) => {
    video.src = videoFile;
  }

  const unloadVideo = () => {
    // overkill unloading to avoid dreaded video 'pending' bug in Chrome. See https://code.google.com/p/chromium/issues/detail?id=234779
    video.pause();
    video.src = '';
    video.removeAttribute('src');
  }

  const loadPhoto = (photoFile) => {
    this._texture = THREE.ImageUtils.loadTexture( photoFile );
  }

  const fullscreen = () => {
    if(element.querySelectorAll('.fa-expand')[0].length > 0) {
      object.resizeGL(screen.width, screen.height);

      addClass(element, 'fullscreen')

      removeClass(element.querySelectorAll('.fa-expand')[0], 'fa-expand')
      addClass(element.querySelectorAll('.fa-expand')[0], 'fa-compress')

      object.isFullscreen = true;
    } else {
      object.resizeGL(object.originalWidth, object.originalHeight);

      removeClass(element, 'fullscreen')
      removeClass(element.querySelectorAll('.fa-compress')[0], 'fa-compress')
      addClass(element.querySelectorAll('.fa-compress')[0], 'fa-expand')

      object.isFullscreen = false;
    }
  }

  const resizeGL = (w, h) => {
    object.renderer.setSize(w, h);
    object.camera.aspect = w / h;
    object.camera.updateProjectionMatrix();
  }

  const showWaiting = () => {
    let loading = element.querySelectorAll('.loading')[0]
    loading.querySelectorAll('.waiting-icon')[0].style.display = ''
    loading.querySelectorAll('.error-icon')[0].style.display = 'none'
    loading.style.display = ''
  }

  const hideWaiting = () => {
    element.querySelectorAll('.loading')[0].style.display = 'none'
  }

  const showError = () => {
    let loading = element.querySelectorAll('.loading')[0];
    loading.querySelectorAll('.waiting-icon')[0].style.display = 'none'
    loading.querySelectorAll('.error-icon')[0].style.display = ''
    loading.style.display = ''
  }

  const destroy = () => {
    window.cancelAnimationFrame(object.requestAnimationId);
    object.requestAnimationId = '';
    object.texture.dispose();
    object.scene.remove(object.mesh);
    if(object.isVideo) {
      unloadVideo();
    }
    $(this._renderer.domElement).remove();
  }

  const attach = (el, detector, document, window) => {
    Detector = detector
    document = document
    window = window
    if (el.tagName) {
      element = el
      object = {options:{}}

      object.defaults = defaults
      object.name = pluginName

      // Place initialization logic here
      // You already have access to the DOM element and
      // the options via the instance, e.g. this.element
      // and this.options
      // you can add more functions like the one below and
      // call them like so: this.yourOtherFunction(this.element, this.options).

      // instantiate some local variables we're going to need
      object.time = new Date().getTime();
      object.controls = {};
      object.id = generateUUID();

      object.requestAnimationId = ''; // used to cancel requestAnimationFrame on destroy
      object.isVideo = false;
      object.isPhoto = false;
      object.isFullscreen = false;
      object.mouseDown = false;
      object.dragStart = {};

      /*
      object.lat = object.options.lat;
      object.lon = object.options.lon;
      object.fov = object.options.fov;
      */

      // save our original height and width for returning from fullscreen
      //object.originalWidth = element.querySelectorAll('canvas')[0].width;
      //object.originalHeight = element.querySelectorAll('canvas')[0].height;

      // add a class to our element so it inherits the appropriate styles
      if (element.classList)
        element.classList.add('Valiant360_default')
      else
        element.className += ' ' + 'Valiant360_default'

      /*
      // add tabindex attribute to enable the focus on the element (required for keyboard controls)
      if(object.options.keyboardControls && !element.getAttribute("tabindex"))
        element.setAttribute("tabindex", "3")
      */

      createMediaPlayer()
      createControls()
    }
    else
      console.log(`${div} is not an HTML div container`)
  }

  const pitch = (num) => {

  }

  const roll = (num) => {

  }

  const yaw = (num) => {

  }

  return {
    attach,
    pitch,
    roll,
    yaw
  }
}

module.exports = ThreeSixty
