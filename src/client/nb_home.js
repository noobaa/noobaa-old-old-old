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
    'ngTouch',
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
        }).when('/chat/', {
            templateUrl: 'chats_list.html',
            controller: 'ChatsCtrl'
        }).when('/chat/:id*', {
            templateUrl: 'chat.html',
            controller: 'ChatCtrl'
        }).when('/profile/', {
            templateUrl: 'friends_template.html',
            controller: ['$scope',
                function($scope) {
                    if (!$scope.friends) {
                        $scope.refresh_friends();
                    }
                }
            ]
        }).when('/yuval/', {
            templateUrl: 'scene_template.html',
            controller: 'YuvalScenesCtrl'
        }).when('/guy/', {
            templateUrl: 'scene_template.html',
            controller: 'GuyScenesCtrl'
        }).otherwise({
            redirectTo: '/watch/'
        });
    }
]);



/////////////////////
// HOME CONTROLLER //
/////////////////////


nb_home.controller('HomeCtrl', [
    '$scope', '$http', '$timeout', '$interval', '$q', '$window', '$location', '$compile',
    'nbUtil', 'nbMultiSelect', 'nbUser', 'nbUserFeedback',
    'nbInode', 'nbUploadSrv', 'nbPlanet', 'nbFeed', 'nbChat',
    function($scope, $http, $timeout, $interval, $q, $window, $location, $compile,
        nbUtil, nbMultiSelect, nbUser, nbUserFeedback,
        nbInode, nbUploadSrv, nbPlanet, nbFeed, nbChat) {

        $scope.nbUtil = nbUtil;
        $scope.nbMultiSelect = nbMultiSelect;
        $scope.nbUser = nbUser;
        $scope.nbUserFeedback = nbUserFeedback;
        $scope.nbInode = nbInode;
        $scope.nbUploadSrv = nbUploadSrv;
        $scope.nbPlanet = nbPlanet;
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

        $scope.click_chats = function() {
            $location.path('/chat/');
        };
        $scope.click_files = function() {
            $location.path('/files/');
        };
        $scope.click_profile = function() {
            $location.path('/profile/');
        };

        var location_paths = [
            'chat',
            'watch',
            'files',
            // 'uploads',
            'profile'
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






//////////////////////
// BROWSE DIRECTIVE //
//////////////////////


nb_home.directive('nbBrowse', function() {
    return {
        replace: true,
        templateUrl: 'browse_template.html',
        scope: { // isolated scope
            context: '='
        },
        controller: [
            '$scope', '$http', '$timeout', '$q', '$compile', '$location', '$rootScope',
            'nbUtil', 'nbMultiSelect', 'nbUser', 'nbInode', 'nbUploadSrv', 'JobQueue',
            function($scope, $http, $timeout, $q, $compile, $location, $rootScope,
                nbUtil, nbMultiSelect, nbUser, nbInode, nbUploadSrv, JobQueue) {
                $scope.human_size = $rootScope.human_size;
                $scope.nbUtil = nbUtil;
                $scope.nbUser = nbUser;
                $scope.nbInode = nbInode;
                $scope.nbUploadSrv = nbUploadSrv;
                $scope.moment = moment;

                $scope.refresh_current = refresh_current;
                $scope.go_up_level = go_up_level;
                $scope.has_parent = has_parent;
                $scope.is_selection_leader = is_selection_leader;
                $scope.num_selected = num_selected;
                $scope.open_inode = open_inode;
                $scope.play_inode = play_inode;
                $scope.toggle_preview = toggle_preview;
                $scope.move_inodes = move_inodes;
                $scope.delete_inodes = delete_inodes;
                $scope.keep_inode = keep_inode;
                $scope.share_inode = share_inode;
                $scope.unshare_inode = unshare_inode;

                var selection = $scope.context.selection;

                $scope.select_inode = function(inode, $index, $event) {
                    nbMultiSelect.select_item(selection, inode, $index, $event);
                };

                $scope.$watch('context.current_inode', function(inode) {
                    $scope.current_inode = inode;
                    refresh_current();
                });

                function refresh_current(force_load) {
                    $scope.search_in_folder = '';
                    nbMultiSelect.reset_selection(selection);
                    nbInode.load_inode($scope.current_inode, force_load).then(function() {
                        if (!$scope.current_inode.isdir) {
                            toggle_preview($scope.current_inode);
                        }
                    });
                }

                nbUploadSrv.notify_create_in_dir = function(dir_id) {
                    if ($scope.current_inode.id === dir_id) {
                        refresh_current('force');
                    }
                };

                function go_up_level() {
                    $location.path('/files/' + ($scope.current_inode.parent_id || ''));
                }

                function has_parent(dir_inode) {
                    return !!dir_inode.id;
                }

                function is_selection_leader(inode) {
                    return selection.items[selection.items.length - 1] === inode;
                }

                function num_selected() {
                    return selection.items.length;
                }

                function stop_event(event) {
                    if (event.stopPropagation) {
                        event.stopPropagation();
                    }
                    return false;
                }

                function open_inode(inode, $index, $event) {
                    // must load in order to detect if dir at all
                    if (!inode.loaded) {
                        return nbInode.load_inode(inode).then(function() {
                            open_inode(inode, $index, $event);
                        });
                    }
                    if (inode.isdir) {
                        $location.path('/files/' + inode.id);
                    } else {
                        nbInode.load_inode(inode);
                        if ((inode.is_selected && !inode.is_previewing) ||
                            nbMultiSelect.select_item(selection, inode, $index, $event)) {
                            // inode.is_previewing = true;
                            play_inode(inode);
                        } else {
                            inode.is_previewing = false;
                        }
                        return stop_event($event);
                    }
                }

                function play_inode(inode, $index, $event) {
                    if (!inode.loaded) {
                        return nbInode.load_inode(inode).then(function() {
                            play_inode(inode, $index, $event);
                        });
                    }
                    if (nbInode.play_inode(inode)) {
                        return;
                    }
                    if ($event) {
                        open_inode(inode, $index, $event);
                    }
                }

                function toggle_preview(inode) {
                    inode.is_previewing = !inode.is_previewing;
                }

                function delete_inodes() {
                    var selected = nbMultiSelect.selection_items(selection); // copy array
                    nbInode.delete_inodes(selected, $scope.current_inode);
                }

                function move_inodes() {
                    var modal;
                    var selected = nbMultiSelect.selection_items(selection);
                    if (!selected.length) {
                        return;
                    }
                    for (var i = 0; i < selected.length; i++) {
                        if (!nbInode.can_move_inode(selected[i])) {
                            var msg = $('<span>')
                                .append('Cannot move item ')
                                .append($('<span>').text(selected[i].name));
                            alertify.error(msg);
                            return;
                        }
                    }
                    var mv_scope = $scope.$new();
                    mv_scope.count = 0;
                    mv_scope.context = {
                        current_inode: $scope.current_inode,
                        dir_only: true
                    };
                    mv_scope.run_disabled = function() {
                        return mv_scope.running || !nbInode.can_move_to_dir(mv_scope.context.current_inode);
                    };
                    mv_scope.run = function() {
                        console.log('RUN', selected);
                        mv_scope.running = true;
                        var promises = new Array(selected.length);
                        for (var i = 0; i < selected.length; i++) {
                            promises[i] = nbInode.move_inode(selected[i], mv_scope.context.current_inode);
                        }
                        $q.all(promises).then(function() {
                            modal.modal('hide');
                            refresh_current();
                        });
                    };
                    mv_scope.title = 'Move to ...';
                    modal = nbUtil.make_modal({
                        template: 'chooser_modal.html',
                        scope: mv_scope,
                    });
                }

                function keep_inode(inode) {
                    if (nbUser.signin_if_needed()) {
                        return;
                    }
                    return nbInode.keep_inode(inode, $scope.context.mydata); //.then(refresh_current, refresh_current);
                }

                function share_inode(inode) {
                    if (nbUser.signin_if_needed()) {
                        return;
                    }
                    return nbInode.share_inode(inode, refresh_current);
                }

                function unshare_inode(inode) {
                    if (nbUser.signin_if_needed()) {
                        return;
                    }
                    return nbInode.unshare_inode(inode).then(refresh_current, refresh_current);
                }
            }
        ]
    };
});




/////////////////////
// MEDIA DIRECTIVE //
/////////////////////


nb_home.directive('nbMedia', ['$parse', '$timeout', 'nbInode', 'nbPlanet',
    function($parse, $timeout, nbInode, nbPlanet) {
        return {
            replace: true,
            link: function(scope, element, attr) {
                scope.nbInode = nbInode;
                scope.media_url = function(inode) {
                    return nbInode.fobj_get_url(inode);
                };
                scope.media_open = function(inode) {
                    return nbInode.seamless_open_inode(inode);
                };
                scope.media_events = scope.$eval(attr.mediaEvents) || {};
                scope.$watch(attr.nbSubtitles, function(value) {
                    scope.media_subtitles = value;
                });
                scope.$watch(attr.nbMedia, function(value) {
                    scope.inode = scope.$eval(attr.nbMedia) || {};
                    if (nbPlanet.on) {
                        if (nbPlanet.open_content(scope.inode)) {
                            return;
                        }
                    }
                    scope.show_content = true;
                    // this is a little bit hacky way to call notify_layout...
                    if (scope.media_events.load) {
                        scope.media_events.load();
                    }
                });
            },
            templateUrl: 'media_template.html'
        };
    }
]);



///////////////////////
// CHOOSER DIRECTIVE //
///////////////////////


nb_home.directive('nbChooser', ['$parse', '$timeout', 'nbInode',
    function($parse, $timeout, nbInode) {
        return {
            replace: true,
            templateUrl: 'chooser_template.html',
            scope: { // isolated scope
                context: '='
            },
            controller: [
                '$scope', '$http', '$timeout', '$q', '$compile', '$rootScope', 'nbUtil', 'nbInode',
                function($scope, $http, $timeout, $q, $compile, $rootScope, nbUtil, nbInode) {
                    $scope.human_size = $rootScope.human_size;
                    $scope.nbUtil = nbUtil;
                    $scope.nbInode = nbInode;

                    set_current_inode($scope.context.current_inode);

                    function set_current_inode(inode) {
                        $scope.context.current_inode = inode;
                        $scope.current_inode = inode;
                    }

                    $scope.open_inode = function(inode) {
                        set_current_inode(inode);
                        nbInode.load_inode(inode);
                    };

                    $scope.has_parent = function(inode) {
                        return !!inode.id;
                    };

                    $scope.go_up_level = function() {
                        if ($scope.current_inode.id) {
                            var parent = nbInode.get_inode($scope.current_inode.parent_id);
                            $scope.open_inode(parent);
                        }
                    };
                }
            ]
        };
    }
]);
