'use strict';

var _ = require('lodash');
var moment = require('moment');
var cf_config = require('../utils/cf_config');

var nb_util = angular.module('nb_util');

nb_util.factory('nbScenes', ['nbUtil', 'nbInode',
    function(nbUtil, nbInode) {
        var $scope = {
            init_scenes: init_scenes
        };

        function init_scenes(scope, uid, owner, scenes) {
            nbUtil.track_event('home.scenes.load', {
                uid: uid
            });
            var base_distro = cf_config.DEFAULT_PROTO + cf_config.PUBLIC_CF + '/' + uid + '_scenes/';
            scope.scene_owner = owner;
            scope.scenes = _.map(scenes, function(s) {
                var scene = {
                    name: s.desc,
                    id: 'v_' + s.id,
                    isdir: true,
                    content_kind: 'dir',
                    comment: s.comment,
                    desc: s.desc,
                    duration: s.duration
                };
                var img_type = 'jpg';
                var img_name = s.id + '.' + img_type;
                scene.image = {
                    name: s.desc,
                    id: 'v_' + img_name,
                    fobj_get_url: base_distro + img_name,
                    content_type: 'image/' + img_type,
                    content_kind: 'image',
                };
                var vid_type = 'mp4';
                var vid_name = s.id + '.' + vid_type;
                scene.video = {
                    name: s.desc,
                    id: 'v_' + vid_name,
                    fobj_get_url: base_distro + vid_name,
                    content_type: 'video/' + vid_type,
                    content_kind: 'video',
                };
                return scene;
            });
            scope.play_scene = function(scene) {
                nbUtil.track_event('home.scenes.play', {
                    uid: uid,
                    name: scene.name
                });
                nbInode.play_inode(scene.video);
            };
            scope.media_events = {
                load: scope.notify_layout,
            };
            scope.create_scene_page = function() {
                nbUtil.track_event('home.scenes.create_own_page', {
                    uid: uid
                });
                alertify.alert('<p>Thank you for showing interest!</p>' +
                    '<p>We also think this feature would be great and we are working on it.</p>' +
                    '<p>If you have any additional feedbacks, drop us a note to <a href="mailto:info@noobaa.com">info@noobaa.com</a></p>');
                // if (nbUser.user) {} else {nbUser.open_signin()}
            };
            // rebuild_layout();
        }

        return $scope;
    }
]);

nb_util.controller('YuvalScenesCtrl', ['$scope', 'nbScenes',
    function($scope, nbScenes) {
        nbScenes.init_scenes($scope, 'yuval', {
            first_name: 'Yuval',
            fbid: 100000601353304
        }, [{
            id: 'superbad',
            comment: 'Superbad finest',
            desc: 'Superbad',
            duration: '0:31',
        }, {
            id: 'kickass2',
            comment: 'Schwartz!',
            desc: 'Kickass 2',
            duration: '0:18',
        }, {
            id: 'Pinapple_express',
            comment: 'My dad owns a Dawoo Lanos',
            desc: 'Pinapple Express',
            duration: '0:27',
        }, {
            id: 'TheHobbit',
            comment: 'Terrible movie. Loved the war scenes though',
            desc: 'The Hobbit',
            duration: '0:18',
        }, {
            id: 'Furious6',
            comment: 'Loved this stunt!',
            desc: 'Fast & Furious 6',
            duration: '0:15',
        }, {
            id: 'TheDarkKnight',
            comment: 'It\'s fun to meet Herzel Ben Tovim in prison with Bruce Whein. Herzel? What are you up to?',
            desc: 'The Dark Night',
            duration: '0:12',
        }, {
            id: 'FamilyGuyAutobots',
            comment: 'Brian was NOT born in the eighties',
            desc: 'Family Guy - Transformers',
            duration: '0:59',
        }, {
            id: 'FamilyGuyNewOrleans',
            comment: 'This is why I will not let my kids watch family guy with me. Too embarrassing to explain',
            desc: 'Family Guy - New Orleans',
            duration: '0:16',
        }]);
    }
]);


nb_util.controller('GuyScenesCtrl', ['$scope', 'nbScenes',
    function($scope, nbScenes) {
        nbScenes.init_scenes($scope, 'guy', {
            first_name: 'Guy',
            fbid: 532326962
        }, [{
            id: 'dumber catch a break',
            comment: 'Don\'t worry, we\'ll catch our break too, just gotta keep our eyes open...',
            desc: 'Dumb & Dumber',
            duration: '1:19',
        }, {
            id: 'dumber extra gloves',
            comment: 'Yeah, we\'re in the rockies',
            desc: 'Dumb & Dumber',
            duration: '0:33',
        }]);

    }
]);
