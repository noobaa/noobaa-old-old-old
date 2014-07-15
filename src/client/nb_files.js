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
        templateUrl: 'files.html',
        scope: { // isolated scope
            context: '=',
            dialog: '='
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
                $scope.selection_menu_disabled = selection_menu_disabled;
                $scope.num_selected = num_selected;
                $scope.has_selected = has_selected;
                $scope.is_selected = is_selected;
                $scope.set_select_mode = set_select_mode;
                $scope.clear_select_mode = clear_select_mode;
                $scope.is_clickable = is_clickable;
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

                $scope.context.action_bar.menu_title = 'FILES';

                $scope.selection = new nbMultiSelect.Class(function(index) {
                    return $scope.entries[index];
                });
                var selection = $scope.selection;

                $scope.$watch('context.current_inode', function(inode) {
                    $scope.current_inode = inode;
                    refresh_current();
                });

                $scope.$watch('context.current_inode.entries', function(entries) {
                    selection.reset_current();
                    if (!entries) {
                        $scope.entries = null;
                    } else {
                        $scope.entries = _.sortBy(entries, 'name');
                    }
                });

                function set_current_item(inode_id) {
                    // updating the context will trigger watch to refresh the files scope
                    $scope.context.current_inode = nbInode.get_inode(inode_id);
                }

                function refresh_current(force_load) {
                    $scope.search_in_folder = '';
                    clear_select_mode();
                    nbInode.load_inode($scope.current_inode, force_load);
                }

                nbUploadSrv.notify_create_in_dir = function(dir_id) {
                    if ($scope.current_inode.id === dir_id) {
                        refresh_current('force');
                    }
                };

                function go_up_level() {
                    var parent_id = ($scope.current_inode.parent_id || '');
                    if ($scope.dialog) {
                        set_current_item(parent_id);
                    } else {
                        $location.path('/files/' + parent_id);
                    }
                }

                function has_parent(dir_inode) {
                    return !!dir_inode.id;
                }

                function selection_menu_disabled() {
                    if (selection.is_empty() || $scope.current_inode.ref_owner) {
                        return true;
                    }
                    var candidate = selection.get_candidate();
                    return !nbInode.can_change_inode(candidate);
                }

                function num_selected() {
                    return selection.get_count();
                }

                function has_selected() {
                    return selection.get_count();
                }

                function is_selected(inode) {
                    return selection.is_selected(inode);
                }

                function set_select_mode() {
                    if ($scope.dialog && $scope.dialog.dir_select) {
                        return;
                    }
                    $scope.select_mode = true;
                }

                function clear_select_mode() {
                    $scope.select_mode = false;
                    selection.reset();
                }

                function is_clickable(inode) {
                    if ($scope.dialog && $scope.dialog.dir_select && !inode.isdir) {
                        return false;
                    }
                    return true;
                }

                function click_inode(inode, $index, $event) {
                    if ($scope.select_mode) {
                        return select_inode(inode, $index, $event);
                    } else {
                        return open_inode(inode, $index, $event);
                    }
                }

                function right_click_inode(inode, $index, $event) {
                    set_select_mode();
                    if (!$scope.select_mode) {
                        return;
                    }
                    select_inode(inode, $index, $event);
                }

                function select_inode(inode, $index, $event) {
                    var op = $event.shiftKey ? 'loop' : '';
                    selection.select(inode, $index, op);
                    if (selection.is_empty()) {
                        clear_select_mode();
                    }
                }

                function open_inode(inode, $index, $event) {
                    if ($scope.dialog) {
                        if ($scope.dialog.dir_select && !inode.isdir) {
                            return;
                        }
                        set_current_item(inode.id);
                    } else {
                        $location.path('/files/' + inode.id);
                    }
                    /*
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
                    */
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
                    var selected = selection.get_items();
                    nbInode.delete_inodes(selected, $scope.current_inode);
                }

                function move_inodes() {
                    var modal;
                    var selected = selection.get_items();
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
                    mv_scope.title = 'Select target folder';
                    mv_scope.context = {
                        current_inode: $scope.current_inode,
                    };
                    mv_scope.dialog = {
                        dir_select: true,
                        run_caption: 'Move',
                        cancel: function() {
                            modal.modal('hide');
                        },
                        run: function() {
                            if (!nbInode.can_move_to_dir(mv_scope.context.current_inode)) {
                                alertify.error('Cannot move to ' + mv_scope.context.current_inode.name);
                                return;
                            }
                            modal.modal('hide');
                            var to_dir = mv_scope.context.current_inode;
                            console.log('RUN', selected, to_dir);
                            var promises = new Array(selected.length);
                            for (var i = 0; i < selected.length; i++) {
                                promises[i] = nbInode.move_inode(selected[i], to_dir);
                            }
                            $q.all(promises)['finally'](function() {
                                refresh_current('force');
                                nbInode.load_inode(to_dir, 'force');
                            });
                        }
                    };
                    modal = nbUtil.make_modal({
                        template: 'files_modal.html',
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
                    nbUtil.coming_soon('files.share_inode_with_club', 'Sharing with club');
                }

                function share_inodes_with_club() {
                    nbUtil.coming_soon('files.share_inodes_with_club', 'Sharing with club');
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
            templateUrl: 'media_template.html',
            link: function(scope, element, attr) {
                scope.nbInode = nbInode;
                scope.media_url = function(inode) {
                    return nbInode.fobj_get_url(inode);
                };
                scope.media_open = function(inode) {
                    return nbInode.seamless_open_inode(inode);
                };
                scope.autoplay = scope.$eval(attr.autoplay);
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
            }
        };
    }
]);
