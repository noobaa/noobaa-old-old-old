'use strict';

var _ = require('underscore');
var moment = require('moment');

var nb_util = angular.module('nb_util');


nb_util.factory('nbFeed', [
    '$http', '$timeout', '$interval', '$q', '$window', '$location', '$rootScope', '$sce', '$sanitize',
    'LinkedList', 'JobQueue', 'nbUtil', 'nbUser', 'nbInode',

    function($http, $timeout, $interval, $q, $window, $location, $rootScope, $sce, $sanitize,
        LinkedList, JobQueue, nbUtil, nbUser, nbInode) {
        var $scope = {
            refresh_feeds: refresh_feeds
        };

        $scope.feeds = [];
        $scope.fetching_feeds = 0;
        var feeds_per_page = 10;

        $scope.search_feed = {
            query: '',
            timeout: null
        };

        function refresh_feeds() {
            if ($scope.fetching_feeds) {
                return;
            }
            $scope.feeds.length = 0;
            $scope.feeds_limit = 0;
            $scope.has_more_feeds = true;
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

        return $scope;

    }
]);


/////////////////////
// FEED CONTROLLER //
/////////////////////


nb_util.controller('FeedCtrl', [
    '$scope', '$q', '$location', '$timeout', 'nbUtil', 'nbUser', 'nbFeed',
    function($scope, $q, $location, $timeout, nbUtil, nbUser, nbFeed) {
        $scope.action_bar_title = 'FEED';
        $scope.feeds = nbFeed.feeds;
        nbFeed.refresh_feeds();
    }
]);

nb_util.controller('FeedItemCtrl', [
    '$scope', '$q', '$location', '$timeout', 'nbUtil', 'nbUser', 'nbInode', 'nbFeed',
    function($scope, $q, $location, $timeout, nbUtil, nbUser, nbInode, nbFeed) {
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
            nbFeed.notify_layout();
        };
        $scope.prev_entry = function() {
            $scope.current_entry_index--;
            nbFeed.notify_layout();
        };
        $scope.media_events = {
            load: nbFeed.notify_layout,
            ended: function() {
                $scope.next_entry();
            },
            open_dir: function() {
                $scope.open_feed_inode(current_entry());
            },
        };
        $scope.$watch('feed.expanded', nbFeed.notify_layout);

        $scope.open_feed_inode = function(inode) {
            $location.path('/files/' + inode.id);
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
            nbFeed.notify_layout();
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
