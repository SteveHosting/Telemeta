/*
 * Copyright (C) 2007-2011 Parisson
 * Copyright (c) 2011 Riccardo Zaccarelli <riccardo.zaccarelli@gmail.com>
 * Copyright (c) 2010 Olivier Guilyardi <olivier@samalyse.com>
 *
 * This file is part of TimeSide.
 *
 * TimeSide is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * TimeSide is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with TimeSide.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Authors: Riccardo Zaccarelli <riccardo.zaccarelli@gmail.com>
 *          Olivier Guilyardi <olivier@samalyse.com>
 */

/**
 * The player class to instantiate a new player. Requires all necessary js (timeside, ruler, markermap etcetera...) and
 * jQuery
 */

//playerDiv, sound, durationInMsec, visualizers, markerMap);
Timeside.classes.Player = Timeside.classes.TimesideClass.extend({
    
    //sound duration is in milliseconds because the soundmanager has that unit,
    //player (according to timeside syntax) has durations in seconds
    init: function(container, sound, soundDurationInMsec, imageCallback, newMarkerCallback) {
        this._super();

        //container is the div #player
        
        if (!container){
            this.debug('ERROR: container is null in initializing the player');
        }

        this.getContainer = function(){
            return container;
        }
        this.getSound = function(){
            return sound;
        }
        this.imageCallback = imageCallback;

        var sd = this.toSec(soundDurationInMsec);
        this.getSoundDuration = function(){
            return sd;
        }
        
        this.soundPosition =  sound.position ? this.toSec(sound.position) : 0;
        //public methods: returns the sound position
        this.getSoundPosition = function(){
            return this.soundPosition;
        };


        //       if(sound.readyState != 3){
        //                /*sound.readyState
        //                 * Numeric value indicating a sound's current load status
        //                 * 0 = uninitialised
        //                 * 1 = loading
        //                 * 2 = failed/error
        //                 * 3 = loaded/success
        //                 */
        //                sound.options.whileloading=function(){
        //
        //                }
        //        };
        
        var currentMarkerIndex=0;
        this.getCurrentMarkerIndex = function(){
            return currentMarkerIndex;
        };


        //initializing markermap and markerui
        var map = new Timeside.classes.MarkerMap();
        this.getMarkerMap = function(){
            return map;
        }

        if(newMarkerCallback){
            this.canAddMarker = function(){
                return true;
            }
            if(typeof newMarkerCallback === 'function'){
                this.newMarker = newMarkerCallback;
            }
        }else{
            this.canAddMarker = function(){
                return false;
            }
        }
    },
    //functions for converting seconds (player unit) to milliseconds (sound manager unit) and viceversa:
    toSec: function(milliseconds){
        return milliseconds/1000;
    },
    toMsec : function(seconds){ //this function has less performances than toSec, as it calls Math.round
        return Math.round(1000*seconds); //however, it is assumed that it is NOT called in loops
    },
    isPlaying : function(){
        var sound = this.getSound();
        if(!sound){
            return false;
        }
        /*Numeric value indicating the current playing state of the sound.
             * 0 = stopped/uninitialised
             * 1 = playing or buffering sound (play has been called, waiting for data etc.)
             *Note that a 1 may not always guarantee that sound is being heard, given buffering and autoPlay status.*/
        return sound && sound.playState==1;
    },
    setSoundPosition: function(newPositionInSeconds){
        //if the player is playing and NOT yet fully loaded, simply calling:
        //this.getSound().setPosition(this.toMsec(newPositionInSeconds));
        //resets the position to zero. So we use this workaround:
        //    this.getSound().stop(); //calling this.pause() hides the waiting bar, which is not the case here
        //    this.soundPosition = newPositionInSeconds;
        //    this.play();

        //however, if this.isPlaying() we first call stop otherwise some fast pointer move effect is undesiderable

        //So:
        var wasPlaying = this.isPlaying();
        if(wasPlaying){
            this.getSound().stop(); //dont call this.pause cause it hides the waitbar, if visible
        }
        //update pointer position. If this call is due to a pointer move (mouse release),
        //ruler.isPointerMovingFromMouse=true and the following code has no effect (the pointer is already at the good position)
        var ruler = this.getRuler();
        if(ruler){
            ruler.movePointer(newPositionInSeconds);
        }
        //set sound position:
        this.soundPosition = newPositionInSeconds;
        //resume playing if it was playing:
        if(wasPlaying){
            var player = this;
            //delay a little bit the play resume, this might avoid fast pointer repositioning
            //(it should not be the case, but it happens. why??)
            setTimeout(function(){
                player.play.apply(player);
            },100);
        }
    },
    
    play : function(){
        var player = this;
        var sound = player.getSound();
        var imgWaitDisplaying = this.isWaitVisible();
        //soundManager multishot set false should prevent the play when already playing. We leave this check for safety
        if(!player || !sound){
            if(!player.isPlaying() && imgWaitDisplaying){
                this.setWait(false);
            }
            return false;
        }

        var toSec = player.toSec;
        var ruler = player.getRuler();
        var sPosInMsec = player.toMsec(player.soundPosition);
        
        var waitDiv = this.getContainer().find('.ts-wait');
        var bufferingString = 'buffering';
        //var forceWait = !imgWaitDisplaying || waitDiv.html() != bufferingString;
        var numberOfSubsequentPlayCall=0;
        var minimumNumberOfSubsequentPlayCall=3;
        var isPlayingId=2;
        var isBufferingId=1;
        var uninitializedId=0;
        var currentState=uninitializedId;
        var playOptions = {
            position: sPosInMsec,
            whileplaying: function(){
                var sPos = this.position;
                var buffering = this.isBuffering; //this refers to the soundmanager sound obj
                //Now, what are we doing here below? we could simply check whether is buffering or not..
                //Unfortunately, when buffering some playState (isBuffering = false) are also fired, randomly
                //ONCE in a while
                //the result is a blinking 'isBuffering' 'isPlaying' state in the wait element displaying the state (not so nice),
                //which is also costly in terms of computation. So, we wait for at least N playstate fired SUBSEQUENTLY, without
                //NO bufferingState fired between them. N is set to minimumNumberOfSubsequentPlayCall. When this happens, we can start moving the
                //pointer as a result of a real play state, and we avoid blinking of the wait element
                switch(buffering){
                    case true:
                        numberOfSubsequentPlayCall = 0; //reset the count
                        switch(currentState){
                            case isBufferingId: //do nothing (wait element already displaying)
                                break;
                            default: //update the wait element showing it:
                                currentState = isBufferingId;
                                player.setWait.apply(player,[bufferingString]);
                        }
                        break;
                    default:
                        switch(currentState){
                            case uninitializedId:
                            case isBufferingId: //in these 2 cases, increment numberOfSubsequentPlayCall
                                numberOfSubsequentPlayCall++;
                                if(numberOfSubsequentPlayCall == minimumNumberOfSubsequentPlayCall){
                                    //if is not buffering, we could skip this. However, there could be the waitbar displaying for some other reason:
                                    player.setWait.apply(player,[false]);
                                    currentState = isPlayingId; //set state for future subsequent calls of this case
                                }else{
                                    break; //do not move pointer (default condition below)
                                }
                            default: //move pointer
                                var sPosInSec = toSec(sPos);
                                player.soundPosition = sPosInSec;
                                ruler.movePointer(sPosInSec);
                        }
                }

            //    consolelog('currentState '+currentState+ ' nspc: '+numberOfSubsequentPlayCall);

            //                if(buffering && (forceWait || !imgWaitDisplaying)){
            //                    imgWaitDisplaying = true;
            //                    forceWait = false;
            //                    player.setWait.apply(player,[bufferingString]);
            //                }else if(!buffering && sPosInMsec < sPos){
            //                    //isBuffering seems to be true at regular interval, so we could be in the case
            //                    //that !buffering but is actually buffering and no sound is heard, so
            //                    //we add the condition sPosInMSec !=sPos as a "sound heard" condition
            //                    sPosInMsec = sPos;
            //                    var sPosInSec = toSec(sPos);
            //                    player.soundPosition = sPosInSec;
            //                    ruler.movePointer(sPosInSec);
            //                    if(imgWaitDisplaying){
            //                        player.setWait.apply(player,[false]);
            //                        imgWaitDisplaying = false;
            //                    }
            //                }
            },
            onfinish: function() {
                //whileplaying is NOT called onsinfish. We must update the pointer:
                //note that for small length sounds (wg, 5 secs) the pointer shifts abruptly from the last
                //whileplaying position to the end. We tried with a setTimeout function but the visual effect is not
                //removed. So we leave this small 'bug'
                ruler.movePointer(player.getSoundDuration());
                if(imgWaitDisplaying){
                    player.setWait.apply(player,[false]);
                    imgWaitDisplaying = false;
                }
            }
        };

        sound.setVolume(sound.volume); //workaround. Just to be sure. Sometimes it fails when we re-play
        sound.play(playOptions);


        return false;
    },
    pause: function(){
        var sound = this.getSound();
        //we don't check if it's playing, as the stop must really stop anyway
        //if(sound && this.isPlaying()){
        sound.stop();
        this.setWait(false);
        return false;
    },
    isWaitVisible: function(){
        return this.getContainer().find('.ts-control').find('.ts-wait').is(':visible');
    },
    getWaitString: function(){
        return this.getContainer().find('.ts-control').find('.ts-wait').html();
    },

    setWait: function(value, optionalCallback){
        var c = this.getContainer();
        var waitDiv = c.find('.ts-control').find('.ts-wait');

        var player = this;
        var wait = function(){};
        if(value){
            var wtext = "";
            if(typeof value == 'string'){
                wtext = value;
            }
            waitDiv.html(wtext);
            wait= function(){
                waitDiv.css('display','inline-block');
                player.fire('waiting',{
                    'value': wtext || true
                }); //assures is a string or a true boolean
            };
        }else{
            wait = function(){
                waitDiv.hide();
                player.fire('waiting',{
                    'value':false
                });
            }
        }
        var delay = 100;
        if(optionalCallback){
            wait();
            setTimeout(optionalCallback, delay);
        }else{
            //if there is no callback, delay the wait function in order to emulate a paraller thread
            //running:
            setTimeout(wait, delay);
        }
    },
    //sets up the player interface and loads the markers. There is theoretically no need for this method, as it might be included in
    //the init constructor, it is separated for "historical" reasons: this method stems from the old _setupInterface,
    //which was a separate method in the old player code. Future releases might include it in the init constructor
    setupInterface: function(markersArray) {
        
        var sound = this.getSound();
        this.debug('player _setupInterface sound.readyState:'+sound.readyState); //handle also cases 0 and 2????
        
        var $J = this.$J; //defined in the super constructor
        var me=this;
        //build the innerHTML as array, then join it. This is usually faster than string concatenation in some browsers.
        //Note that the player image (see below) is given a src with a temporary 1x1 pixels transparent image
        //Basically, NOT specifying any src for image tags can be harmful,
        //see http://www.nczonline.net/blog/2009/11/30/empty-image-src-can-destroy-your-site/ and
        //http://geekswithblogs.net/bcaraway/archive/2007/08/24/114945.aspx for details
        var html = ["<div class='ts-viewer'>",
        "<div class='ts-ruler'></div>",
        "<div class='ts-wave'>",
        "<div class='ts-image-canvas'></div>",
        "<div class='ts-image-container'>",
        // "<img class='ts-image' src='/images/transparent.png' alt='' />",
        "</div>",
        "</div>",
        "</div>",
        "<div class='ts-control'>",
        //"<div class='ts-layout'>",
        //"<div class='ts-playback'>",
        "<a class='ts-play'></a>",
        "<a class='ts-pause'></a>",
        "<a class='ts-rewind'></a>",
        "<a class='ts-forward'></a>",
        "<a class='ts-set-marker'></a>",
        //        "<a class='ts-volume'></a>",

        //"<div class='ts-volume'>",
        "<a class='ts-volume-speaker'></a>",
        "<div class='ts-volume-wrapper-div'>",
        "<a class='ts-volume-bar-container'>",
        "<span class='ts-volume-bar'></span>",
        "</a>",
        "</div>",

        "<div class='ts-wait'></div>",
        //"<img class='ts-wait'/>",
        //"<select class='ts-visualizer'></select>",
        //"</div>",
        //"</div>",
        "</div>"];

        this.getContainer().html(html.join(''));
        var container = this.getContainer();

        var control = container.find('.ts-control');

        //bind events to buttons:
        var rewind = control.find('.ts-rewind');
        rewind.attr('href', '#').click(function(e){
            me.rewind.apply(me);
            return false;
        });
        
        var forward = control.find('.ts-forward');
        forward.attr('href', '#').click(function(e){
            me.forward.apply(me);
            return false;
        });

        var pause = control.find('.ts-pause');
        pause.attr('href', '#').bind('click', function(){
            me.pause.apply(me);
            return false;
        });

        var play = control.find('.ts-play');
        play.attr('href', '#').bind('click', function(){
            me.setWait('loading',function(){
                me.play.apply(me);
            });
            return false;
        });

        var setMarkerButton = control.find('.ts-set-marker');

        var canAddMarkers = this.canAddMarker();
        
        if(canAddMarkers){
            setMarkerButton.show().attr('href','#').unbind('click').bind('click', function(){
                me.addMarker(me.getSoundPosition());
                return false;
            });
        }
       

        //volume:
        var volumeSpeaker = control.find('.ts-volume-speaker');
        var volumeBarContainer = control.find('.ts-volume-bar-container');
        var volumeBar = volumeBarContainer.find('.ts-volume-bar');

        var getVol = function(x){
            var vol = 100*x/volumeBarContainer.width();
            //allow click to easily set to zero or 100, ie set a margin to 5%:
            var margin = 5;
            if (vol < margin){
                vol=0;
            }else if(vol >100-margin){
                vol = 100;
            }
            return vol;
        };
        function setVolume(event,volumeElement){
            //var ticks = [18,26,33,40,47];
            var x = event.pageX - volumeElement.offset().left; //using absolute coordinates allows us to
            //avoid using layerX (not supported in all browsers) and clientX (which needs the window scrollLeft variable)
            me.setSoundVolume(getVol(x));
            return false;
        }
        volumeBarContainer.attr('href', '#').click(function(event){
            return setVolume(event,volumeBar);
        });
        volumeSpeaker.attr('href', '#').click(function(){
            me.setSoundVolume(me.getSoundVolume()>0 ? 0 : getVol(volumeBar.outerWidth()));
            return false;
        });
        this.setSoundVolume(this.getSoundVolume());

        control.find('a').attr('href', '#') ;

        //SET NECESSARY CSS (THIS WILL OVERRIDE CSS SET IN STYLESHEETS):
        var viewer = container.find('.ts-viewer');
        var wave = container.find('.ts-wave');
        var ruler_ = container.find('.ts-ruler');
        wave.add(viewer).add(control).add(ruler_).css({
            'position':'relative',
            'overflow':'hidden'
        });
        //assigning display and title to all anchors
        control.find('*').css({
            'display':'inline-block',
            'overflow':'hidden'
        });
        if(!canAddMarkers){
            setMarkerButton.hide().unbind('click');
        }
       
        var waitImg = control.find('.ts-wait');
        waitImg.html('wait').css({
            'position':'absolute'
        });


        var div = control.find('.ts-volume-wrapper-div');
        div.css({
            'position':'absolute',
            'left':(volumeSpeaker.position().left+volumeSpeaker.outerWidth())+'px',
            'top':0,
            'width':'auto',
            'height':'100%'
        });
        //END NECESSARY CSS
        
        this.setWait(false);

        //creating the ruler
        var ruler = new Timeside.classes.Ruler(viewer, this.getSoundDuration());
        this.getRuler = function(){
            return ruler;
        }
        
        this.resize(); //which calls also ruler.resize() (see below)
        

        //binds click for the pointer
        var v = $J('#player').find('.ts-viewer');
        v.unbind('click').click(function(evt){
            var w = v.width();
            var x = evt.pageX - v.offset().left; //using absolute coordinates allows us to
            //avoid checking whether or not we are clicking on a vertical marker line, on a subdiv etcetera
            var sd = me.getSoundDuration();
            me.setSoundPosition(sd*x/w);
        });
       

        
        //finally, load markers and bind events for markers (see method below):
        //NOTE: loadMarkers ASYNCHRONOUSLY CALLS THE SERVER, SO METHODS WRITTEN AFTER IT MIGHT BE EXECUTED BEFORE
        //loadMarkers has finished its job
        //this.loadMarkers(callback);
       
        this.loadMarkers(markersArray);
    //set the marker popup
    //functions to set the marker popup
    //        var popupMarker = $J('<div/>').addClass('component').css({
    //            'dislay':'none',
    //            'position':'absolute',
    //            'zIndex':1000,
    //            'overflow':'auto',
    //            'display':'none' //TODO: remove this
    //        //'backgroundColor':'#666'
    //        });
    //        $J('body').append(popupMarker);
    //        var w = v.width();
    //        var h = v.height();
    //        var offs = v.offset(); //relative to the document
    //        var width = parseInt(w/2);
    //        var height = parseInt(h/2);
    //        var margin = 5;
    //        popupMarker.css({
    //            'left':(margin+offs.left+width)+'px',
    //            'top': parseInt(margin+offs.top)+'px',
    //            'width':width+'px',
    //            'height':height+'px'
    //        });
    //        popupMarker.html("<table style='width:100%'><tr><td>"+gettrans('title')+"</td><td class='title'></td></tr><tr><td>"+
    //            gettrans('description')+"</td><td class='description'></td></tr></table>");
    //        this.getMarkerPopup = function(){
    //            return popupMarker;
    //        }
    },

    showMarkerPopup: function(markerIndex){
    //        var popup = this.getMarkerPopup();
    //
    //        if(popup.attr('id') != 'markerpopup'+markerIndex){
    //
    //            var marker = this.getMarkerMap().toArray()[markerIndex];
    //            var pos = this.getSoundPosition();
    //            var mPos = marker.offset;
    //            var span = 0.3;
    //
    //            if(pos>=mPos-span && pos<=mPos+span){
    //                popup.attr('id','markerpopup'+markerIndex);
    //                popup.find('.title').html(marker.title);
    //                popup.find('.description').html(marker.desc);
    //                if(!popup.is(':visible')){
    //                    popup.show('fast');
    //                }
    //            }
    //        }
    },

    /**
      * sets whether or not window resize resizes also this player. When true, a variable _dynamicResize =setInterval(...) is attached to
      * this class. When false, if _dynamicResize is in this class, clearInterval(_dynamicResize) is called and then the key is deleted
      */
    setDynamicResize: function(value){
        var key = '_dynamicResize';
        if(!value && key in this){
            clearInterval(this[key]);
            delete this[key];
            return;
        }
        var wdw = this.$J(window);
        var w = wdw.width();
        //var h = wdw.height();
        var me = this;
        this.dynamicResize = setInterval(function(){
            var newW = wdw.width();
            if(w!=newW){
                w = newW;
                //still wait a second: are we still adjusting the window? (call resize just once):
                setTimeout(function(){
                    if(wdw.width()==newW){
                        me.resize.apply(me);
                    }
                },200);
            }
        },100);
    },
    resize: function() {
        this.debug("resizing");
        var height;
        var container = this.getContainer();
        
        var wave = container.find('.ts-wave');

        //var image = wave.find('img.ts-image');
        //if(!image.length){
        //    image = this.$J('<img/>');
        //}
        height = wave.height();
        this.debug("wave height:" + height);
        if (!height) {
            //this.debug('ERROR: image height is zero in player.,resize!!!!')
            //height = image.height();
            //if (!height){
            height = 200;
        //}
        }
        //set image, imagecontainer and canvas (container on imagecontainer for lines and pointer triangles) css
        var elements = container.find('.ts-image-container').css('zIndex','0')
        .add(container.find('.ts-image-canvas').css('zIndex','1')); //the two children of ts-wave. Set also the zIndex
        //in order to visualize the canvas OVER the wav image

        elements.css('width', 'auto'); // for IE6. We leave it although IE6 is not anymore supported
        var style = {
            width: wave.width(),
            height: height
        }
        elements.css(style);
        elements.css('position','absolute');
        
        
        
        //refreshing images:
        
        this.refreshImage();
        this.getRuler().resize();

       
        
        //adjusting select size:
        //        var select = container.find('.ts-visualizer');
        //        var imgWait = container.find('.ts-wait');
        //
        //        //NOTE: some buttons might be hidden AFTER THIS METHOD HAS BEEN INVOKED
        //        //Therefore, setting the width of select or imgWait is skipped for the moment.
        //        select.css('fontSize','90%'); //this is to increase probability that the select width will fit the available space
        //
        //        var control = container.find('.ts-control');
        //        var maxHeight = control.height();
        //        select.add(imgWait).css('maxHeight',(maxHeight-2)+'px'); //at least a margin left and top of 1 px (see below)
        //
        //        var span = (maxHeight-select.outerHeight())/2; //do not include margins in oputerHeight (we will set them to zero below)
        //        select.css({
        //            'margin':'0px',
        //            'marginTop':span+'px',
        //            'marginLeft':span+'px'
        //        });
        //        var span2 = (maxHeight - imgWait.outerHeight())/2; //do not include margins in oputerHeight (we will set them to zero below)
        //        imgWait.css({
        //            'margin':'0px',
        //            'marginTop':span2+'px',
        //            'marginLeft':span+'px'
        //        })

        
        return this;
    },
    getImageUrl : function(){
        var image = this.getContainer().find('.ts-image');
        if(image && image.length){
            return image.attr('src');
        }
        return '';
    },
    refreshImage: function(){
        var container = this.getContainer();
        var imageC = container.find('.ts-image-container');
        var image = imageC.find('.ts-image');
        //        if(optionalImageAsJQueryElement){
        //            image = optionalImageAsJQueryElement;
        //        }else{
        //            image = container.find('.ts-image');
        //        }

        var size = this.getImageSize();
        var imgSrc = this.imageCallback(size.width,size.height);
        var imageNotYetCreated = image.length == 0;
        if(!imageNotYetCreated && image.attr('src')==imgSrc){
            return;
        }
        
        var player= this;
        var waitString = 'refreshing img';
        player.setWait.apply(player,[waitString]);

        
        if(imageNotYetCreated){
            image = this.$J('<img/>');
        }

        //image inside ts-image-container:
        image.css({
            'width':'100%',
            'height':'100%'
        }); // for IE7. Does not seem to hurt IE8, FF, Chrome
        
        image.load(function(){
            if(player.getWaitString()===waitString){
                //we could have started playback, which means that if the wait bar has a different text,
                //another method is responsible for hiding it and therefore MUST stay visible
                player.setWait.apply(player,[false]);
            }
            image.unbind('load');
            if(imageNotYetCreated){
                imageC.append(image.addClass('ts-image'));
            }
        });

        image.attr('src', imgSrc);
       
    },
    getImageSize: function(){
        var wave = this.getContainer().find('.ts-wave');
        return {
            width: wave.width(),
            height:wave.height()
        }
    },

    //    refreshImage: function(optionalImageAsJQueryElement){
    //        var image;
    //        var container = this.getContainer();
    //        if(optionalImageAsJQueryElement){
    //            image = optionalImageAsJQueryElement;
    //        }else{
    //            image = container.find('.ts-image');
    //        }
    //        var select = container.find('.ts-visualizer');
    //        var funcImg = function(player_image_url, width, height){
    //            var _src_ = null;
    //            if (player_image_url && (width || height)) {
    //                _src_ = player_image_url.replace('WIDTH', width + '').replace('HEIGHT', height + '');
    //            }
    //            return _src_;
    //        };
    //        var imageUrl = getVisualizers()[""+select.val()];
    //        var imgSrc = funcImg(imageUrl, image.width(),image.height());
    //        if(image.attr('src')==imgSrc){
    //            return;
    //        }
    //
    //        var player= this;
    //        player.setWait.apply(player,['refreshing image']);
    //        image.load(function(){
    //            player.setWait.apply(player,[false]);
    //            select.show();
    //            image.unbind('load');
    //        });
    //
    //        image.attr('src', imgSrc);
    //
    //    },

    getSoundVolume :function(){
        var s = this.getSound();
        return s ? s.volume : 0;
    },
    //moves the pointer (and sound position) forward till the next marker or the end of sound
    forward: function() {
        var map = this.getMarkerMap();
        var markers = map.toArray();
        var len = markers.length;
        var offset =  this.getSoundDuration();
        var position = this.getSoundPosition(); //parseFloat(this.getSoundPosition());
        var idx = map.insertionIndex(position);
        if(idx<0){
            idx = -idx-1; //cursor is not on a a marker, get the insertion index
        }else{
            //cursor is on a marker. As there might be several markers with the same offset
            //(see MarkerMap.insertionIndex), move to the outmost right
            while(idx<len  && markers[idx].offset == position){
                idx++;
            }
        }
        
        if(idx< len){
            offset = markers[idx].offset;
        }
        this.setSoundPosition(offset);
        return false;
    },
    //moves the pointer (and sound position) backward till the previous marker or the start of sound
    rewind: function() {
        var map = this.getMarkerMap();
        var markers = map.toArray();
        var offset =  0;
        var position = this.getSoundPosition(); //parseFloat(this.getSoundPosition());
        var idx = map.insertionIndex(position);
        if(idx<0){
            idx = -idx-1; //cursor is not on a a marker, get the insertion index
        }else{
            //cursor is on a marker. As there might be several markers with the same offset
            //(see MarkerMap.insertionIndex), move to the outmost left
            while(idx>0  && markers[idx-1].offset == position){
                idx--;
            }
        }
        idx--; //move backward (rewind)
        if(idx>=0){
            offset = markers[idx].offset;
        }
        this.setSoundPosition(offset);
        return false;
    },

    //    setSoundVolume: function(volume){
    //
    //        if(typeof volume != 'number'){ //note: typeof for primitive values, instanceof for the rest
    //            //see topic http://stackoverflow.com/questions/472418/why-is-4-not-an-instance-of-number
    //            volume = 100;
    //        }
    //        if(volume<0){
    //            volume = 0;
    //        }else if(volume>100){
    //            volume = 100;
    //        }
    //        var sound = this.getSound();
    //        //        if(sound.volume == volume){
    //        //            return;
    //        //        }
    //        sound.setVolume(volume);
    //        //update the anchor image:
    //        var indices = [20,40,60,80,100,100000];
    //
    //        var volumeElm = this.getContainer().find('.ts-volume');
    //        for(var i=0; i <indices.length; i++){
    //            if(volume<indices[i]){
    //                var pos = -28*i;
    //                pos = '0px '+ pos+ 'px'; //DO NOT SET !important as in FF3 DOES NOT WORK!!!!!
    //                volumeElm.css('backgroundPosition',pos);
    //                return;
    //            }
    //        }
    //    // this.elements.volume.css('backgroundPosition','0px 0px !important')
    //
    //    },

    setSoundVolume: function(volume){
        if(typeof volume != 'number'){ //note: typeof for primitive values, instanceof for the rest
            //see topic http://stackoverflow.com/questions/472418/why-is-4-not-an-instance-of-number
            volume = 100;
        }
        if(volume<0){
            volume = 0;
        }else if(volume>100){
            volume = 100;
        }
        volume = Math.round(volume);
        var sound = this.getSound();
        if(sound){
            sound.setVolume(volume);
        }
        var control = this.getContainer().find('.ts-control');
        var volumeSpeaker = control.find('.ts-volume-speaker');
        var volumeBarContainer = control.find('.ts-volume-bar-container');
        var volumeBar = volumeBarContainer.find('.ts-volume-bar');
        if(volume==0){
            volumeSpeaker.removeClass('ts-volume-speaker-on').addClass('ts-volume-speaker-off');
            volumeBar.css('visibility','hidden');
        }else{
            volumeSpeaker.removeClass('ts-volume-speaker-off').addClass('ts-volume-speaker-on');
            volumeBar.css('visibility','visible');
            volumeBar.css({
                'height':'100%',
                'width':volume+'%'
            });
        }
    },

    newMarker: function(offset){
        return {
            offset:offset
        };
    },
    addMarker: function(offset){
        var map = this.getMarkerMap();
        if(map){
            map.add(this.newMarker(offset));
        }
    },

    removeMarker: function(identifier){ //identifier can be an number (marker index) or a marker (the index will be aearched)
        //see marlermap.remove
        var map = this.getMarkerMap();
        if(map){
            map.remove(identifier);
        }
    },
    getMarker: function(index){
        var map = this.getMarkerMap();
        if(map){
            return map.toArray()[index];
        }
        return undefined;
    },
    //markers is an array of objects with at least the field offset:sconds.milliseconds
    loadMarkers: function(markers){
        //ruler.bind('markermoved',this.markerMoved,this);
        //var $J = this.$J; //reference to jQuery

        var player = this;
        //initialize the map.
        var map = this.getMarkerMap();
        //var mapUI = this.getMarkersUI();
        var ruler = this.getRuler();
        map.clear();
        ruler.clear();
       
  
        var rulerAdd = ruler.add;
            
        if(markers){
            //add markers to the map. No listeners associated to it (for the moment)
            for(var i =0; i< markers.length; i++){
                map.add.apply(map,[markers[i]]);
            }
            //add markers to ruler and div
            map.each(function(i,marker){
                rulerAdd.apply(ruler,[marker.offset, i, 'isEditable' in marker ? marker.isEditable : false]);
            });
        }
        //BINDINGS:
        //
        //1) ADD
        //
        //add binding to the setMarker button (html anchor):
        //        var setMarkerButton = player.getContainer().find('.ts-set-marker');
        //
        //        var showAddMarkerButton = this.canAddMarker();
        //        if(setMarkerButton){
        //            if(showAddMarkerButton){
        //                setMarkerButton.show().attr('href','#').unbind('click').bind('click', function(){
        //                    player.addMarker(player.getSoundPosition());
        //                    return false;
        //                });
        //            }else{
        //                setMarkerButton.hide().unbind('click');
        //            }
        //        }


        //the function above calls map.add:
        //add bindings when adding a marker:
        map.bind('add',function(data){
            //mapuiAdd.apply(mapUI,[data.marker, data.index,data.isNew]);
            rulerAdd.apply(ruler,[data.marker.offset, data.index,data.marker.isEditable]);
            player.fire('markerAdded',data);
            consolelog('add');
            consolelog(data);
        });

        //2) MOVE

        //add the binding when we move a marker on the ruler:
        ruler.bind('markermoved',function(data){
            var soundPos = data.soundPosition;
            var markerClass = data.markerClass;
            if(markerClass=='pointer'){
                player.setSoundPosition(soundPos);
            }else{
                map.move(data.markerElement.getIndex(), soundPos);
            }
        });

        //and now add a binding to the map when we move a marker:
          
        map.bind('move', function(data){
            var from = data.fromIndex;
            var to = data.toIndex;
            ruler.move.apply(ruler,[from,to]);
            player.fire('markerMoved',data);
            consolelog('moved');
            consolelog(data);
        });

            
        //remove
        map.bind('remove',function(data){
            ruler.remove.apply(ruler, [data.index]);
            player.fire('markerRemoved',data);
            consolelog('removed');
            consolelog(data);
        });

    }

});