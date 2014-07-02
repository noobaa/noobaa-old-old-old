'use strict';

var _ = require('underscore');
var moment = require('moment');

var nb_util = angular.module('nb_util');


//////////////////////
// BROWSE DIRECTIVE //
//////////////////////


nb_util.directive('nbBrowse', function() {
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
                $scope.get_selection_leader = get_selection_leader;
                $scope.is_selection_leader = is_selection_leader;
                $scope.num_selected = num_selected;
                $scope.toggle_edit_mode = toggle_edit_mode;
                $scope.click_inode = click_inode;
                $scope.right_click_inode = right_click_inode;
                $scope.play_inode = play_inode;
                $scope.share_inode_with_club = share_inode_with_club;
                $scope.share_inodes_with_club = share_inodes_with_club;
                $scope.move_inodes = move_inodes;
                $scope.delete_inodes = delete_inodes;
                $scope.keep_inode = keep_inode;
                $scope.share_inode = share_inode;
                $scope.unshare_inode = unshare_inode;

                var selection = $scope.context.selection;


                $scope.$watch('context.current_inode', function(inode) {
                    $scope.current_inode = inode;
                    refresh_current();
                });

                function refresh_current(force_load) {
                    $scope.search_in_folder = '';
                    nbMultiSelect.reset_selection(selection);
                    nbInode.load_inode($scope.current_inode, force_load);
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

                function get_selection_leader() {
                    return selection.items[selection.items.length - 1];
                }

                function is_selection_leader(inode) {
                    return get_selection_leader() === inode;
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

                function toggle_edit_mode() {
                    if ($scope.edit_mode) {
                        $scope.edit_mode = false;
                        nbMultiSelect.reset_selection(selection);
                    } else {
                        $scope.edit_mode = true;
                    }
                }

                function click_inode(inode, $index, $event) {
                    if ($scope.edit_mode) {
                        return select_inode(inode, $index, $event);
                    } else {
                        return open_inode(inode, $index, $event);
                    }
                }

                function right_click_inode(inode, $index, $event) {
                    if (!$scope.edit_mode) {
                        toggle_edit_mode();
                    }
                    select_inode(inode, $index, $event);
                    var selected = nbMultiSelect.selection_items(selection);
                    if (!selected.length) {
                        toggle_edit_mode();
                    }
                }

                function select_inode(inode, $index, $event) {
                    nbMultiSelect.select_item(selection, inode, $index, $event, 'append');
                    // return stop_event($event);
                }

                function open_inode(inode, $index, $event) {
                    // must load in order to detect if dir at all
                    if (!inode.loaded) {
                        return nbInode.load_inode(inode).then(function() {
                            open_inode(inode, $index, $event);
                        });
                    }
                    if (true || inode.isdir) {
                        $location.path('/files/' + inode.id);
                    } else {
                        nbInode.load_inode(inode);
                        play_inode(inode);
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
                    if (inode.isdir) {
                        open_inode(inode, $index, $event);
                    }
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

                function share_inode_with_club() {
                    alertify.log('TODO share_inode_with_club');
                }

                function share_inodes_with_club() {
                    alertify.log('TODO share_inodes_with_club');
                }
            }
        ]
    };
});




/////////////////////
// MEDIA DIRECTIVE //
/////////////////////


nb_util.directive('nbMedia', ['$parse', '$timeout', 'nbInode', 'nbPlanet',
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
                scope.autoplay = scope.$eval(attr.Autoplay);
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


nb_util.directive('nbChooser', ['$parse', '$timeout', 'nbInode',
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
