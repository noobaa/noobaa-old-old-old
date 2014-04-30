(function() {
    'use strict';

    var nb_welcome = angular.module('nb_welcome', ['nb_util']);

    nb_welcome.controller('WelcomeCtrl', [
        '$scope', '$location', '$anchorScroll',
        '$timeout', '$interval', '$templateCache', '$sce',
        'nbUser', 'nbUtil',

        function($scope, $location, $anchorScroll, $timeout, $interval, $templateCache, $sce, nbUser, nbUtil) {
            $scope.nbUser = nbUser;
            $scope.need_chrome_ref = !nbUtil.bowser.chrome;

            nbUtil.track_event('welcome.load');


            $scope.show_welcome_video = function() {
                var base_url = 'https://d11c7vtptj6nd7.cloudfront.net/messaging/';
                var video_source = function(name, ext) {
                    return {
                        src: $sce.trustAsResourceUrl(base_url + name + '.' + ext),
                        type: 'video/' + ext
                    };
                };
                var scope = $scope.$new();
                scope.sources = [
                    video_source('buddy', 'webm'),
                    video_source('buddy', 'ogv'),
                    video_source('buddy', 'm4v'),
                    // video_source('buddy2', 'mp4'),
                ];
                nbUtil.modal($templateCache.get('video_modal.html'), scope, 'fullscreen');
            };

            // $anchorScroll();
            $scope.scroll = function(hash) {
                console.log('SCROLL', hash);
                $location.hash(hash);
                $anchorScroll();
            };

            // do smooth scrolling to anchors with href
            var html_body = $('body');
            $('.scroller').click(function() {
                var href = $.attr(this, 'href');
                console.log('SCROLL', href);
                html_body.animate({
                    scrollTop: $(href).offset().top
                }, 500, function() {
                    // window.location.hash = href;
                });
                return false;
            });

            // $('body').children().hide().fadeIn(2000);

            function clouds() {
                // Defining our variables
                // world and viewport are DOM elements,
                // worldXAngle and worldYAngle are floats that hold the world rotations,
                // d is an int that defines the distance of the world from the camera 
                var world = document.getElementById('clouds-world'),
                    viewport = document.getElementById('clouds-viewport'),
                    worldXAngle = 0,
                    worldYAngle = 0,
                    d = 0;
                // objects is an array of cloud bases
                // layers is an array of cloud layers
                var objects = [],
                    layers = [];

                // Event listener to transform mouse position into angles 
                // from -180 to 180 degress, both vertically and horizontally
                window.addEventListener('mousemove', function(e) {
                    worldYAngle = -(0.5 - (e.clientX / window.innerWidth)) * 180;
                    worldXAngle = (0.5 - (e.clientY / window.innerHeight)) * 180;
                    updateView();
                });

                generate();
                updateView();

                function random_range(from, to) {
                    return from + (Math.random() * (to - from));
                }

                // Changes the transform property of world to be
                // translated in the Z axis by d pixels,
                // rotated in the X axis by worldXAngle degrees and
                // rotated in the Y axis by worldYAngle degrees.

                function updateView() {
                    var t = 'translateZ( ' + d + 'px ) ' +
                        'rotateX( ' + worldXAngle + 'deg ) ' +
                        'rotateY( ' + worldYAngle + 'deg )';
                    world.style.transform = t;
                    world.style['-webkit-transform'] = t;
                    requestAnimationFrame(update);
                }

                // Iterate layers[], update the rotation and apply the
                // inverse transformation currently applied to the world.
                // Notice the order in which rotations are applied.

                function update() {
                    for (var i = 0; i < layers.length; i++) {
                        update_layer(layers[i]);
                    }
                    // not running the animation because it hogs the cpu.
                    // instead this is called on mouse move to refresh the cloud
                    // from the new perspective.
                    // requestAnimationFrame(update);
                }

                function update_layer(layer) {
                    layer.data.a += layer.data.speed;
                    var t = 'translateX( ' + layer.data.x + 'px ) ' +
                        'translateY( ' + layer.data.y + 'px ) ' +
                        'translateZ( ' + layer.data.z + 'px ) ' +
                        'rotateY( ' + (-worldYAngle) + 'deg ) ' +
                        'rotateX( ' + (-worldXAngle) + 'deg ) ' +
                        'rotateZ( ' + layer.data.a + 'deg ) ' +
                        'scale( ' + layer.data.s + ' )';
                    layer.style.transform = t;
                    layer.style['-webkit-transform'] = t;
                }

                // Creates a single cloud base: a div in world
                // that is translated randomly into world space.
                // Each axis goes from -256 to 256 pixels.

                function createCloud() {
                    var l = 150;
                    var cloud = document.createElement('div' );
                    cloud.className = 'cloudBase';
                    var t = 'translateX( ' + random_range(-l, l) + 'px ) ' +
                        'translateY( ' + random_range(-l, l) + 'px ) ' +
                        'translateZ( ' + random_range(-l, l) + 'px )';
                    // cloud.style.backgroundColor = 'hsla(180, 100%, 50%, 1)';
                    cloud.style.transform = t;
                    cloud.style['-webkit-transform'] = t;
                    world.appendChild(cloud);
                    for (var j = 0; j < 10; j++) {
                        var layer = document.createElement('img');
                        layer.src = '/public/images/cloud.png';
                        // layer.style.backgroundColor = 'hsla(180, 100%, 50%, 0.1)';
                        layer.className = 'cloudLayer';
                        layer.data = {
                            x: random_range(-l, l),
                            y: random_range(-l, l),
                            z: random_range(-l, l),
                            a: random_range(-180, 180),
                            s: random_range(0.7, 1.3),
                            speed: random_range(0.04, 0.07)
                        };
                        layers.push(layer);
                        cloud.appendChild(layer);
                    }
                    return cloud;
                }

                // Clears the DOM of previous clouds bases 
                // and generates a new set of cloud bases

                function generate() {
                    objects = [];
                    layers = [];
                    if (world.hasChildNodes()) {
                        while (world.childNodes.length >= 1) {
                            world.removeChild(world.firstChild);
                        }
                    }
                    for (var j = 0; j < 5; j++) {
                        objects.push(createCloud());
                    }
                }

            }
            clouds();
        }
    ]);
})();
