'use strict';

var _ = require('underscore');
var moment = require('moment');
// var masonry = require('masonry-shim');
// var masonry = require('masonry.js/dist/masonry.pkgd.js');
// console.log('MASONRY', Masonry);

var nb_home = angular.module('nb_home', [
    'ngRoute',
    'ngAnimate',
    'ngSanitize',
    // 'ngTouch',
    'nb_util'
]);


///////////////////
// ROUTES CONFIG //
///////////////////


nb_home.config(['$routeProvider', '$locationProvider',
    function($routeProvider, $locationProvider) {
        $locationProvider.html5Mode(true);
        $routeProvider.when('/watch/', {
            templateUrl: 'feed_template.html',
            controller: ['$scope',
                function($scope) {
                    if (!$scope.feeds || !$scope.feeds.length) {
                        $scope.refresh_feeds();
                    }
                }
            ]
        }).when('/files/:id*?', {
            template: [
                '<div nb-browse context="home_context"></div>'
            ].join('\n'),
            controller: ['$scope', '$routeParams',
                function($scope, $routeParams) {
                    $scope.set_current_item($routeParams.id);
                }
            ]
        }).when('/club/', {
            templateUrl: 'clubs.html',
            controller: 'ClubsCtrl'
        }).when('/club/new', {
            templateUrl: 'club_info.html',
        }).when('/club/info/:id*', {
            templateUrl: 'club_info.html',
        }).when('/club/member', {
            templateUrl: 'friend_chooser.html',
            controller: 'ClubMemberCtrl'
        }).when('/club/:id*', {
            templateUrl: 'club.html',
            controller: 'ClubCtrl'
        }).when('/account/', {
            templateUrl: 'account.html',
            controller: 'UserAccountCtrl'
        }).when('/yuval/', {
            templateUrl: 'scene_template.html',
            controller: 'YuvalScenesCtrl'
        }).when('/guy/', {
            templateUrl: 'scene_template.html',
            controller: 'GuyScenesCtrl'
        }).otherwise({
            redirectTo: '/club'
        });
    }
]);



/////////////////////
// HOME CONTROLLER //
/////////////////////


nb_home.controller('HomeCtrl', [
    '$scope', '$http', '$timeout', '$interval', '$q', '$window', '$location', '$compile',
    'nbUtil', 'nbMultiSelect', 'nbUser', 'nbUserFeedback',
    'nbInode', 'nbUploadSrv', 'nbPlanet', 'nbFeed', 'nbClub',
    function($scope, $http, $timeout, $interval, $q, $window, $location, $compile,
        nbUtil, nbMultiSelect, nbUser, nbUserFeedback,
        nbInode, nbUploadSrv, nbPlanet, nbFeed, nbClub) {

        $scope.nbUtil = nbUtil;
        $scope.nbMultiSelect = nbMultiSelect;
        $scope.nbUser = nbUser;
        $scope.nbUserFeedback = nbUserFeedback;
        $scope.nbInode = nbInode;
        $scope.nbUploadSrv = nbUploadSrv;
        $scope.nbPlanet = nbPlanet;
        $scope.nbClub = nbClub;
        $scope.moment = moment;

        $scope.root_dir = nbInode.get_inode();

        // TODO temp.
        var refresh_feeds = $scope.refresh_feeds = nbFeed.refresh_feeds;

        $scope.home_context = {
            current_inode: $scope.root_dir,
            selection: {
                items: [],
                source_index: function(i) {
                    return $scope.home_context.current_inode.entries[i];
                }
            }
        };


        if (nbUser.user) {
            nbUtil.track_event('home.load' + (nbPlanet.on ? '.planet' : ''));
        } else {
            nbUtil.track_event('welcome.load' + (nbPlanet.on ? '.planet' : ''));
        }

        nbUser.update_user_info();

        if (nbUser.user) {
            init_read_dir();
        } else {
            (function() {
                var sher = {
                    first_name: 'Sher'
                };
                var wang = {
                    first_name: 'Wang'
                };
                var max = {
                    first_name: 'Max'
                };
                var kiefer = {
                    first_name: 'Kiefer'
                };
                var inodes = [{
                    name: 'Share videos',
                    fobj_get_url: '/public/images/bg_wave.jpg',
                    content_type: 'image/jpg',
                    content_kind: 'image',
                    id: 'v1',
                    shr: '',
                    // new_keep_inode: true,
                    // done_keep: true,
                    ref_owner: sher,
                    messages: [{
                        user: sher,
                        text: 'Sharing videos with your friends has never been so easy.'
                    }, {
                        user: sher,
                        text: 'Connect using your Facebook or Google+ account and click on their faces!'
                    }]
                }, {
                    name: 'Watch videos',
                    fobj_get_url: '/public/images/bg_bike.jpg',
                    content_type: 'image/jpg',
                    content_kind: 'image',
                    id: 'v2',
                    shr: '',
                    // new_keep_inode: true,
                    // done_keep: true,
                    ref_owner: wang,
                    messages: [{
                        user: wang,
                        text: 'Watching your own videos is always fun, but let’s face it – most of us are more interested in what our friends have been up to.'
                    }, {
                        user: wang,
                        text: 'NooBaa makes it easy and fun to watch videos shared by your friends.'
                    }]
                }, {
                    name: 'Access anywhere',
                    fobj_get_url: '/public/images/bg_snow.jpg',
                    content_type: 'image/jpg',
                    content_kind: 'image',
                    id: 'v3',
                    shr: '',
                    // new_keep_inode: true,
                    // done_keep: true,
                    ref_owner: max,
                    messages: [{
                        user: max,
                        text: 'Videos are accessible from any device, anywhere, anytime.'
                    }, {
                        user: max,
                        text: 'Stream directly from the cloud.'
                    }]
                }, {
                    name: 'Protect your memories',
                    fobj_get_url: '/public/images/bg_skate.jpg',
                    content_type: 'image/jpg',
                    content_kind: 'image',
                    id: 'v4',
                    shr: '',
                    // new_keep_inode: true,
                    // done_keep: true,
                    ref_owner: kiefer,
                    messages: [{
                        user: kiefer,
                        text: 'No need for an external hard drive.'
                    }, {
                        user: kiefer,
                        text: 'Keep a copy on the cloud for safekeeping and peace of mind.'
                    }]
                }];
                $scope.feeds = _.map(inodes, function(inode) {
                    return {
                        name: inode.name,
                        isdir: inode.isdir,
                        // expanded: true,
                        inodes: [inode]
                    };
                });
                $scope.root_dir.entries = nbInode.merge_inode_entries(inodes);
            })();
        }



        $scope.click_my_feed = function() {
            if ($location.path() === '/watch/') {
                $scope.refresh_feeds();
            } else {
                $location.path('/watch/');
                if (!$scope.feeds) {
                    $scope.refresh_feeds();
                } else {
                    // rebuild_layout();
                }
            }
        };

        $scope.click_clubs = function() {
            $location.path('/club/');
        };
        $scope.click_files = function() {
            $location.path('/files/');
        };
        $scope.click_account = function() {
            $location.path('/account/');
        };

        var location_paths = [
            'club',
            'files',
            'uploads',
            'account'
        ];

        $scope.swipe_left = function() {
            var path = $location.path().split('/')[1];
            var index = _.indexOf(location_paths, path);
            if (index >= 0 && index < location_paths.length - 1) {
                $location.path('/' + location_paths[index + 1] + '/');
            }
        };
        $scope.swipe_right = function() {
            var path = $location.path().split('/')[1];
            var index = _.indexOf(location_paths, path);
            if (index > 0 && index < location_paths.length) {
                $location.path('/' + location_paths[index - 1] + '/');
            }
        };

        $scope.set_current_item = function(inode_id) {
            $scope.home_context.current_inode = nbInode.get_inode(inode_id);
        };

        function init_read_dir() {
            return nbInode.read_dir($scope.root_dir).then(function(res) {
                // console.log('ROOT FOLDERS', res);
                var entries = $scope.root_dir.entries;
                for (var i = 0; i < entries.length; i++) {
                    var e = entries[i];
                    if (nbInode.is_my_data_dir(e)) {
                        $scope.mydata = e;
                        $scope.home_context.mydata = e;
                    } else if (nbInode.is_swm_dir(e)) {
                        e.swm = true;
                        e.ro = true;
                        e.sorting_func = nbInode.ctime_newest_first_sort_func;
                        $scope.swm = e;
                        $scope.home_context.swm = e;
                    } else if (nbInode.is_sbm_dir(e)) {
                        e.ro = true;
                        e.sorting_func = nbInode.ctime_newest_first_sort_func;
                        $scope.sbm = e;
                        $scope.home_context.sbm = e;
                    } else {
                        console.error('UNRECOGNIZED ROOT FOLDER', e);
                    }
                }
            }).then(function() {
                if (nbUser.server_data.signup) {
                    console.log('ADD GHOSTS');
                    return $http({
                        method: 'POST',
                        url: '/api/user/add_ghosts/'
                    }).then(function(res) {
                        console.log('ADD GHOSTS', res.data);
                        nbUtil.track_event('home.add_ghosts', res.data);
                    });
                }
            }).then(function() {
                if ($location.path() === '/watch/') {
                    return refresh_feeds();
                }
            }).then(null, function(err) {
                console.error('GET ROOT FOLDERS FAILED', err);
                $timeout(init_read_dir, 3000);
            });
        }



        nbUploadSrv.get_upload_target = function(event) {
            var src_dev_id = nbPlanet.on ? nbPlanet.get_source_device_id() : undefined;
            // see inode_upload()
            var inode_upload = $(event.target).data('inode_upload');
            if (inode_upload) {
                return {
                    inode_id: inode_upload.id,
                    src_dev_id: src_dev_id
                };
            }

            console.log('UP', $scope.home_context);
            var dir_inode = $scope.home_context.current_inode;
            if (nbInode.can_upload_to_dir(dir_inode)) {
                return {
                    dir_inode_id: dir_inode.id,
                    src_dev_id: src_dev_id
                };
            }
            if (nbInode.can_upload_to_dir($scope.mydata)) {
                console.log('upload to mydata - since current_inode is', dir_inode);
                return {
                    dir_inode_id: $scope.mydata.id,
                    src_dev_id: src_dev_id
                };
            }
            console.error('bailing upload');
            return false;
        };


        $scope.show_client_installation = function() {
            nbUtil.track_event('home.install.show');
            nbUtil.make_modal({
                template: 'install_modal.html',
                scope: $scope
            });
        };

        $scope.show_client_expansion = function() {
            nbUtil.track_event('home.space.show');
            nbUtil.make_modal({
                template: 'coshare_modal.html',
                scope: $scope
            });
        };


        $scope.open_upload_file = function() {
            if (nbUser.signin_if_needed()) {
                return;
            }
            nbUploadSrv.open_file_input();
        };

        $scope.open_upload_dir = function() {
            if (nbUser.signin_if_needed()) {
                return;
            }
            nbUploadSrv.open_dir_input();
        };
    }
]);
