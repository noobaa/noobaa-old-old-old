/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
/* jshint -W099 */
(function() {
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
            }).when('/items/:item_id*?', {
                template: [
                    '<div nb-browse context="home_context"></div>'
                ].join('\n'),
                controller: ['$scope', '$routeParams',
                    function($scope, $routeParams) {
                        $scope.set_current_item($routeParams.item_id);
                    }
                ]
            }).when('/friends/', {
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
                controller: ['$scope',
                    function($scope) {
                        $scope.init_scenes('yuval', {
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
                ]
            }).when('/guy/', {
                templateUrl: 'scene_template.html',
                controller: ['$scope',
                    function($scope) {
                        $scope.init_scenes('guy', {
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
                ]
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
        'nbUtil', 'nbMultiSelect', 'nbUser', 'nbInode', 'nbUploadSrv', 'nbPlanet',
        function($scope, $http, $timeout, $interval, $q, $window, $location, $compile,
            nbUtil, nbMultiSelect, nbUser, nbInode, nbUploadSrv, nbPlanet) {
            $scope.nbUtil = nbUtil;
            $scope.nbMultiSelect = nbMultiSelect;
            $scope.nbUser = nbUser;
            $scope.nbInode = nbInode;
            $scope.nbUploadSrv = nbUploadSrv;
            $scope.nbPlanet = nbPlanet;
            $scope.moment = moment;

            $scope.refresh_feeds = refresh_feeds;
            $scope.root_dir = nbInode.get_inode();

            $scope.refresh_friends = refresh_friends;
            $scope.present_map = present_map;
            $scope.set_fb_invites = set_fb_invites;
            $scope.send_fb_invites = send_fb_invites;
            $scope.set_google_invites = set_google_invites;
            $scope.send_google_invites = send_google_invites;
            $scope.send_friend_message = send_friend_message;

            $scope.home_context = {
                current_inode: $scope.root_dir,
                selection: {
                    items: [],
                    source_index: function(i) {
                        return $scope.home_context.current_inode.entries[i];
                    }
                }
            };

            $scope.feeds = [];
            $scope.fetching_feeds = 0;
            var feeds_per_page = 10;

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

            $scope.init_scenes = function(uid, owner, scenes) {
                nbUtil.track_event('home.scenes.load', {
                    uid: uid
                });
                var base_distro = 'https://d11c7vtptj6nd7.cloudfront.net/' + uid + '_scenes/';
                $scope.scene_owner = owner;
                $scope.scenes = _.map(scenes, function(s) {
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
                $scope.play_scene = function(scene) {
                    nbUtil.track_event('home.scenes.play', {
                        uid: uid,
                        name: scene.name
                    });
                    nbInode.play_inode(scene.video);
                };
                $scope.media_events = {
                    load: $scope.notify_layout,
                };
                $scope.create_scene_page = function() {
                    nbUtil.track_event('home.scenes.create_own_page', {
                        uid: uid
                    });
                    alertify.alert('<p>Thank you for showing interest!</p>' +
                        '<p>We also think this feature would be great and we are working on it.</p>' +
                        '<p>If you have any additional feedbacks, drop us a note to <a href="mailto:info@noobaa.com">info@noobaa.com</a></p>');
                    // if (nbUser.user) {} else {nbUser.open_signin()}
                };
                rebuild_layout();
            };


            $scope.click_my_feed = function() {
                if ($location.path() === '/watch/') {
                    $scope.refresh_feeds();
                } else {
                    $location.path('/watch/');
                    if (!$scope.feeds) {
                        $scope.refresh_feeds();
                    } else {
                        rebuild_layout();
                    }
                }
            };

            $scope.click_my_items = function() {
                $location.path('/items/');
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


            $scope.search_feed = {
                query: '',
                timeout: null
            };

            function refresh_feeds() {
                if (!$scope.swm || !$scope.sbm || $scope.fetching_feeds) {
                    return;
                }
                $scope.feeds.length = 0;
                $scope.feeds_limit = 0;
                $scope.has_more_feeds = true;
                $scope.safe_apply();
                fetch_feeds(feeds_per_page);
            }

            function fetch_feeds(count) {
                if ($scope.fetching_feeds) {
                    return;
                }
                $scope.fetching_feeds = true;
                return $http({
                    method: 'GET',
                    url: '/api/feed/',
                    params: {
                        skip: $scope.feeds_limit,
                        limit: count,
                        search: $scope.search_feed.query
                    }
                }).then(function(res) {
                    var entries = nbInode.merge_inode_entries(res.data.entries);
                    $scope.feeds_limit += count;
                    $scope.has_more_feeds = entries.length < count ? false : true;
                    entries.sort(nbInode.ctime_newest_first_sort_func);
                    // collect together feeds with same name and type (for share loops)
                    var feeds_by_key = {};
                    _.each(entries, function(e) {
                        var key = (e.isdir ? 'd:' : 'f:') + e.name;
                        var f = feeds_by_key[key];
                        if (!f) {
                            f = {
                                isdir: e.isdir,
                                name: e.name,
                                inodes: [e]
                            };
                            feeds_by_key[key] = f;
                            $scope.feeds.push(f);
                        } else {
                            if (e.ref_owner) {
                                f.inodes.push(e);
                            } else {
                                f.inodes.unshift(e); // mine goes first
                            }
                        }
                    });
                    $scope.safe_apply();
                }).then(function() {
                    rebuild_layout();
                    $scope.fetching_feeds = false;
                }, function(err) {
                    console.error('FAILED FETCH FEEDS', err);
                    $scope.fetching_feeds = false;
                    throw err;
                });
            }

            $scope.more_feeds = function() {
                nbUtil.track_event('home.feed.scroll', {
                    count: $scope.feeds_limit
                });
                $scope.force_manual_fetch_feed = !$scope.force_manual_fetch_feed;
                fetch_feeds(feeds_per_page);
            };

            $scope.search_feed_changed = function() {
                $timeout.cancel($scope.search_feed.timeout);
                $scope.search_feed.timeout = $timeout(refresh_feeds, 500);
                return ''; // used for clearing the query
            };

            // auto fetch feeds on scroll to bottom
            var jq_window = $(window);
            jq_window.scroll(function() {
                if (!$scope.has_more_feeds || $scope.fetching_feeds || $scope.force_manual_fetch_feed) {
                    return;
                }
                $timeout.cancel($scope.feed_scroll_timeout);
                $scope.feed_scroll_timeout = $timeout(function() {
                    $timeout.cancel($scope.feed_scroll_timeout);
                    $scope.feed_scroll_timeout = null;
                    if (!$scope.has_more_feeds || $scope.fetching_feeds) {
                        return;
                    }
                    var jq_marker = $('#more_feeds_marker');
                    if (!jq_marker.length) {
                        return;
                    }
                    var marker = jq_marker.offset().top;
                    var bottom = jq_window.scrollTop() + jq_window.height();
                    if (bottom + 5 > marker) {
                        $scope.more_feeds();
                    }
                }, 1000);
            });


            function do_layout() {
                console.log('LAYOUT');
                $timeout.cancel($scope.do_layout_timeout);
                $timeout.cancel($scope.do_layout_fast_timeout);
                $scope.do_layout_timeout = null;
                $scope.do_layout_fast_timeout = null;
                if ($scope.should_rebuild_layout) {
                    $scope.should_rebuild_layout = false;
                    if ($scope.masonry) {
                        $scope.masonry.destroy();
                        $scope.masonry = null;
                    }
                }
                if ($scope.masonry) {
                    $scope.masonry.layout();
                } else {
                    var elem = $('.feeds_container');
                    if (!elem.length) {
                        return;
                    }
                    var x = window.scrollX;
                    var y = window.scrollY;
                    $scope.masonry = new Masonry(elem[0], {
                        itemSelector: '.feed_item',
                        // columnWidth: 300,
                        gutter: 20,
                        isFitWidth: true
                    });
                    window.scrollTo(x, y);
                }
            }

            function rebuild_layout() {
                $scope.should_rebuild_layout = true;
                if (!$scope.do_layout_fast_timeout) {
                    $scope.do_layout_fast_timeout = $timeout(do_layout, 1);
                }
            }

            $scope.notify_layout = function() {
                if (!$scope.do_layout_timeout) {
                    $scope.do_layout_timeout = $timeout(do_layout, 50);
                }
            };


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
                nbUtil.content_modal('<h4>Install Client</h4>', $('#client_installation').html(), $scope);
            };

            $scope.show_client_expansion = function() {
                nbUtil.track_event('home.space.show');
                nbUtil.content_modal('<h4>Choose Space Plan</h4>', $('#client_expansion').html(), $scope);
            };

            var feedback_dialog = $('#feedback_dialog');

            $scope.click_feedback = function() {
                $scope.feedback_send_done = false;
                // feedback_dialog.nbdialog('open');
                feedback_dialog.modal('show');
            };

            $scope.send_feedback = function() {
                // add to persistent local storage, and return immediately
                // the worker will send in background
                $scope.feedbacks.push($scope.feedback_text);
                localStorage.feedbacks = JSON.stringify($scope.feedbacks);
                $scope.feedback_send_done = true;
                $scope.feedback_text = '';
                $scope.feedback_worker();
            };

            $scope.feedback_worker = function() {
                if ($scope.feedback_promise) {
                    return;
                }
                if (!$scope.feedbacks.length) {
                    return;
                }
                console.log('sending feedback.', 'queue:', $scope.feedbacks.length);
                $scope.feedback_promise = $http({
                    method: 'POST',
                    url: '/api/user/feedback/',
                    data: {
                        feedback: $scope.feedbacks[0]
                    }
                }).then(function() {
                    console.log('SENT FEEDBACK, REMAIN', $scope.feedbacks.length);
                    $scope.feedbacks.shift(); // remove sent element
                    localStorage.feedbacks = JSON.stringify($scope.feedbacks);
                    $scope.feedback_promise = null;
                    $timeout($scope.feedback_worker, 1000);
                }, function(err) {
                    console.error('FAILED FEEDBACK (will retry)', err);
                    $scope.feedback_promise = null;
                    $timeout($scope.feedback_worker, 5000);
                });
            };

            $scope.feedbacks = localStorage.feedbacks ?
                JSON.parse(localStorage.feedbacks) : [];
            $scope.feedback_worker();

            $scope.refreshing_friends = 0;

            $scope.invite_options = {
                text: [
                    'I\'m using NooBaa to share videos with friends. \n',
                    'You should be here too!'
                ].join('')
            };
            if (nbUser.user && nbUser.user.first_name) {
                $scope.invite_options.text += '\n' + nbUser.user.first_name;
            }

            function refresh_friends() {
                nbUtil.track_event('home.friends.show');
                $scope.fb_invites = {};
                $scope.google_invites = {};
                $scope.sending_fb_invites = false;
                $scope.refreshing_friends++;
                $http({
                    method: 'GET',
                    url: '/api/user/friends/'
                }).then(function(res) {
                    $scope.refreshing_friends--;
                    // console.log('GOT FRIENDS', res);
                    $scope.friends = res.data;
                }, function(err) {
                    $scope.refreshing_friends--;
                    console.error('FAILED GET FRIENDS', err);
                });
            }

            function present_map(list, key) {
                var map = {};
                for (var i = 0; i < list.length; i++) {
                    map[list[i][key]] = true;
                }
                return map;
            }

            function set_fb_invites(arg) {
                if (arg === true) {
                    $scope.fb_invites = present_map($scope.friends.fb, 'fbid');
                } else if (arg === false) {
                    $scope.fb_invites = {};
                } else {
                    if ($scope.fb_invites[arg]) {
                        delete $scope.fb_invites[arg];
                    } else {
                        $scope.fb_invites[arg] = true;
                    }
                }
            }

            function set_google_invites(arg) {
                if (arg === true) {
                    $scope.google_invites = present_map($scope.friends.google, 'googleid');
                } else if (arg === false) {
                    $scope.google_invites = {};
                } else {
                    if ($scope.google_invites[arg]) {
                        delete $scope.google_invites[arg];
                    } else {
                        $scope.google_invites[arg] = true;
                    }

                }
            }

            function send_fb_invites() {
                var fbids = _.keys($scope.fb_invites);
                nbUtil.track_event('home.friends.fb_invite', {
                    count: fbids.length,
                    fbids: fbids
                });
                $scope.sending_fb_invites = true;
                snd();

                function snd() {
                    var now = _.first(fbids, 50);
                    fbids = _.rest(fbids, 50);
                    FB.ui({
                        method: 'apprequests',
                        to: now,
                        title: 'NooBaa',
                        message: $scope.invite_options.text,
                        data: nbUser.user.id
                    }, function(res) {
                        console.log('FB APP REQUESTS', res);
                        if (!fbids.length || res.error_code) {
                            $scope.sending_fb_invites = false;
                        } else {
                            snd(); // async loop
                        }
                    });
                }
            }

            function send_google_invites() {
                console.log('TODO send_google_invites');
            }

            function send_friend_message(friend) {
                if (friend.fbid) {
                    FB.ui({
                        method: 'send',
                        to: friend.fbid, // only single target is possible
                        link: 'https://www.noobaa.com?fbsender=' + nbUser.user.id
                    }, function(res) {
                        console.log('FB SEND', res);
                    });
                } else {
                    console.log('TODO send_friend_message to googleid');
                }
            }

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



    /////////////////////
    // FEED CONTROLLER //
    /////////////////////


    nb_home.controller('FeedCtrl', [
        '$scope', '$q', '$location', '$timeout', 'nbUtil', 'nbUser', 'nbInode',
        function($scope, $q, $location, $timeout, nbUtil, nbUser, nbInode) {
            $scope.reload_feed = reload_feed;
            $scope.current_entry = current_entry;
            $scope.current_entry_index = 0;
            var f = $scope.feed;
            $scope.$watch('feed', function() {
                f = $scope.feed;
                reload_feed();
            });

            function reload_feed() {
                $scope.current_inode = f.inodes[0];
                if (f.isdir) {
                    return nbInode.load_inode($scope.current_inode).then(current_entry_switcher);
                }
            }

            function current_entry_switcher() {
                $timeout.cancel(f.timeout_switcher);
                delete f.timeout_switcher;
                var inode = $scope.current_inode;
                if (!inode.entries_by_kind || !inode.entries_by_kind.image || !inode.entries_by_kind.image.length) {
                    return;
                }
                $scope.current_image_index =
                    typeof($scope.current_image_index) !== 'number' ?
                    0 : (($scope.current_image_index + 1) % inode.entries_by_kind.image.length);
                $scope.current_entry_index = inode.entries.indexOf(
                    inode.entries_by_kind.image[$scope.current_image_index]);

                // TODO check why switching forces image reload each time and misses browser cache
                // f.timeout_switcher = $timeout(current_entry_switcher, 10000);
            }

            function current_entry() {
                var inode = $scope.current_inode;
                return inode.entries ? inode.entries[$scope.current_entry_index] : inode;
            }

            $scope.next_entry = function() {
                $scope.current_entry_index++;
                $scope.notify_layout();
            };
            $scope.prev_entry = function() {
                $scope.current_entry_index--;
                $scope.notify_layout();
            };
            $scope.media_events = {
                load: $scope.notify_layout,
                ended: function() {
                    $scope.next_entry();
                },
                open_dir: function() {
                    $scope.open_feed_inode(current_entry());
                },
            };
            $scope.$watch('feed.expanded', $scope.notify_layout);

            $scope.open_feed_inode = function(inode) {
                $location.path('/items/' + inode.id);
            };

            $scope.play_feed_inode = function(inode) {
                nbUtil.track_event('home.play_feed');
                if (nbInode.play_inode(inode)) {
                    return;
                }
                $scope.open_feed_inode(inode);
            };


            $scope.num_messages = function() {
                return _.reduce(f.inodes, function(sum, inode) {
                    return sum + (inode.messages && inode.messages.length || 0);
                }, 0);
            };

            $scope.keep_feed = function() {
                if (nbUser.signin_if_needed()) {
                    return;
                }
                if ($scope.done_keep()) {
                    return $scope.open_feed_inode($scope.current_inode);
                }
                var inode = $scope.current_inode;
                return nbInode.keep_inode(inode, $scope.mydata).then(reload_feed, reload_feed);
            };

            $scope.done_keep = function() {
                var inode = $scope.current_inode;
                if (!inode) {
                    return;
                }
                if (!inode.ref_owner && !inode.not_mine) {
                    return true;
                }
                if (inode.new_keep_inode) {
                    return true;
                }
            };

            $scope.running_keep = function() {
                var inode = $scope.current_inode;
                return inode.running_keep;
            };

            $scope.keep_and_share_feed = function() {
                if (nbUser.signin_if_needed()) {
                    return;
                }
                var inode = $scope.current_inode;
                return nbInode.keep_and_share(inode, $scope.mydata, $scope.refresh_feeds);
            };

            $scope.show_comment_box = function(comment_box) {
                comment_box.show = !comment_box.show;
                $scope.notify_layout();
            };

            $scope.post_comment = function(comment_box) {
                if (nbUser.signin_if_needed()) {
                    return;
                }
                if (!comment_box || !comment_box.inode || !comment_box.text) {
                    return;
                }
                comment_box.posting = true;
                nbInode.post_inode_message(comment_box.inode, comment_box.text).then(function() {
                    comment_box.posting = false;
                    comment_box.show = false;
                    comment_box.text = '';
                    return nbInode.get_inode_messages(comment_box.inode);
                }, function() {
                    comment_box.posting = false;
                    return nbInode.get_inode_messages(comment_box.inode);
                });
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
                        $location.path('/items/' + ($scope.current_inode.parent_id || ''));
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
                            $location.path('/items/' + inode.id);
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
                        var read_dir_promises = new Array(selected.length);
                        for (var i = 0; i < selected.length; i++) {
                            var inode = selected[i];
                            if (!inode) {
                                console.error('no selected inode, bailing');
                                return;
                            }
                            if (nbInode.is_root_inode(inode)) {
                                alertify.error('Cannot delete root folder');
                                return;
                            }
                            if (nbInode.is_not_mine(inode)) {
                                alertify.error('Cannot delete someone else\'s file ' + inode.name);
                                return;
                            }
                            read_dir_promises[i] = inode.isdir ? nbInode.read_dir(inode) : $q.when(null);
                        }
                        $q.all(read_dir_promises).then(function(read_dir_results) {
                            var all_empty = _.reduce(read_dir_results, function(memo, inode) {
                                return memo && (!inode || inode.entries.length === 0);
                            }, true);
                            read_dir_results = null;
                            var dlg = $('#delete_dialog').clone();
                            if (!all_empty) {
                                //modify the display message in the dialog
                                dlg.find('#not_empty_msg').css('display', 'block');
                                dlg.find('#normal_msg').css('display', 'none');
                            }
                            var del_scope = $scope.$new();
                            del_scope.count = 0;
                            dlg.find('#dialog_ok').off('click').on('click', function() {
                                dlg.find('button.nbdialog_close').text('Hide');
                                dlg.find('a.nbdialog_close').attr('title', 'Hide');
                                dlg.find('#dialog_ok')
                                    .addClass('disabled')
                                    .empty()
                                    .append($('<i class="fa fa-cog fa-spin fa-lg fa-fw"></i>'))
                                    .append($compile('<span style="padding-left: 20px">Deleted {{count}}</span>')(del_scope));
                                del_scope.$digest();
                                nbInode.recursive_delete(selection.items, del_scope, function() {
                                    nbInode.read_dir($scope.current_inode);
                                    dlg.nbdialog('close');
                                    del_scope.$destroy();
                                });
                            });
                            dlg.nbdialog('open', {
                                remove_on_close: true,
                                modal: true
                            });
                        }, function(err) {
                            console.error('FAILED TO CHECK DIR EMPTY', err);
                            throw err;
                        });
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
                        var hdr = $('<div class="modal-header">')
                            .append($('<button type="button" class="close" data-dismiss="modal" aria-hidden="true">').html('&times;'))
                            .append($('<h4>').text('Move to ...'));
                        var body = $('<div class="modal-body" nb-chooser context="context">').css('padding', 0);
                        var foot = $('<div class="modal-footer">').css('margin-top', 0)
                            .append($('<button type="button" class="btn btn-default" data-dismiss="modal">').text('Close'))
                            .append($('<button type="button" class="btn btn-primary" ng-click="run()" ng-disabled="run_disabled()">').text('OK'));
                        modal = nbUtil.modal($('<div>').append(hdr, body, foot), mv_scope);
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

})();
