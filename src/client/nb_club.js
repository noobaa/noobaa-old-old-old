'use strict';

var _ = require('underscore');
var moment = require('moment');

var nb_util = angular.module('nb_util');



nb_util.factory('nbClub', [
    '$http', '$timeout', '$interval', '$q',
    '$window', '$location', '$rootScope',
    'nbUtil', 'nbUser', 'nbInode',

    function($http, $timeout, $interval, $q,
        $window, $location, $rootScope,
        nbUtil, nbUser, nbInode) {

        var $scope = {
            get_club: get_club,
            get_club_or_redirect: get_club_or_redirect,
            poll_clubs: poll_clubs,
            reset_active_club: reset_active_club,
            set_active_club: set_active_club,
            activate_club: activate_club,
            goto_clubs: goto_clubs,
            goto_club: goto_club,
            goto_club_info: goto_club_info,
            goto_add_member: goto_add_member,
            save_club: save_club,
            get_club_for_update: get_club_for_update,
            start_club_with_email: start_club_with_email,
            send_club_message: send_club_message,
            // objects
            clubs: {},
            last_poll: 0,
            NEW_CLUB_OBJ: {
                title: '',
                admin: true,
                members: [{
                    user: nbUser.user.id,
                    user_info: nbUser.user,
                    admin: true
                }]
            },
            total_new_msgs: 0,
        };

        $rootScope.$watch(function() {
            // the watch function checks change by max mtime
            return _.max($scope.clubs, function(c) {
                return c.mtime_date.getTime();
            }).mtime_date;
        }, function() {
            // sort the clubs by mtime
            $scope.clubs_arr = _.sortBy($scope.clubs, function(c) {
                return -c.mtime_date.getTime();
            });
        });


        $q.when(nbUser.init_friends()).then(poll_clubs);


        function poll_clubs() {
            var new_last_poll;
            if ($scope.poll_in_progress) {
                return $scope.poll_in_progress;
            }
            if ($scope.poll_timeout) {
                $timeout.cancel($scope.poll_timeout);
                $scope.poll_timeout = null;
            }
            $scope.poll_in_progress = $http({
                method: 'GET',
                url: '/api/club/',
                params: {
                    last_poll: $scope.last_poll
                }
            }).then(function(res) {
                var clubs = res.data.clubs;
                if (!clubs || !clubs.length) {
                    return;
                }
                _.each(clubs, merge_club);
                $scope.last_poll = clubs[0].mtime;
                console.log('POLL', clubs.length, $scope.last_poll);
            })['finally'](function() {
                $scope.poll_in_progress = null;
                $scope.poll_timeout = $timeout(poll_clubs, 10000);
            });
            return $scope.poll_in_progress;
        }

        function merge_club(club) {
            club.mtime_date = new Date(club.mtime);
            _.each(club.msgs, set_user_info);
            var c = $scope.clubs[club._id];
            if (c) {
                var msgs = club.msgs || [];
                msgs = msgs.concat(c.msgs || []);
                msgs = _.uniq(msgs, function(m) {
                    return m._id;
                });
                _.extend(c, club);
                c.msgs = msgs;
                // console.log('GOT EXISTING CLUB', c);
            } else {
                c = club;
                $scope.clubs[c._id] = c;
                // console.log('GOT NEW CLUB', c);
            }
            _.each(c.members, set_user_info);
            count_new_msgs(c);
            return c;
        }

        function set_user_info(item) {
            if (item.user_info) {
                return;
            }
            if (item.user == nbUser.user.id) {
                item.user_info = nbUser.user;
            } else {
                item.user_info = nbUser.get_friend_by_id(item.user);
            }
        }


        function get_club(club_id) {
            return $scope.clubs[club_id];
        }

        function get_club_or_redirect(club_id) {
            var club = get_club(club_id);
            if (!club) {
                $location.path('/club/');
                return;
            }
            return club;
        }

        function reset_active_club() {
            if ($scope.active_club) {
                touch_club();
            }
            $scope.active_club = null;
        }

        function set_active_club(club_id) {
            if ($scope.active_club) {
                touch_club();
            }
            $scope.active_club = get_club_or_redirect(club_id);
            return $scope.active_club;
        }

        function activate_club(club_id) {
            if (!set_active_club(club_id)) {
                return;
            }
            merge_club_inodes($scope.active_club);
            return $scope.active_club;
        }


        function goto_clubs() {
            $location.path('/club/');
        }

        function goto_club(club_id) {
            $location.path('/club/' + (club_id || ''));
        }

        function goto_club_info(club_id) {
            $location.path('/club/info/' + club_id);
        }

        function goto_add_member() {
            $location.path('/club/member');
        }


        function touch_club() {
            $q.when(mark_seen($scope.active_club));
        }

        function send_club_message(club, msg) {
            return $http({
                method: 'POST',
                url: '/api/club/' + club._id + '/msg',
                data: {
                    text: msg.text,
                    inode: msg.inode
                }
            }).then(poll_clubs).then(touch_club);
        }

        function mark_seen(club) {
            if (!club.msgs || !club.msgs.length) {
                return;
            }
            var last_msg_id = club.msgs[0]._id;
            var prev_msg_id = club.seen_msg;
            if (prev_msg_id === last_msg_id) {
                return;
            }
            // console.log('MARK SEEN', prev_msg_id, '->', last_msg_id);
            return $http({
                method: 'PUT',
                url: '/api/club/' + club._id + '/msg',
                data: {
                    seen_msg: last_msg_id
                }
            }).then(function() {
                if (club.seen_msg === prev_msg_id) {
                    club.seen_msg = last_msg_id;
                    count_new_msgs(club);
                }
            });
        }


        function count_new_msgs(club) {
            if (!club.msgs) {
                return;
            }
            $scope.total_new_msgs -= (club.new_msgs || 0);
            if (!club.seen_msg) {
                club.new_msgs = club.msgs.length;
                $scope.total_new_msgs += club.new_msgs;
                return;
            }
            for (var i = 0; i < club.msgs.length; i++) {
                if (club.msgs[i]._id === club.seen_msg) {
                    break;
                }
            }
            club.new_msgs = i;
            $scope.total_new_msgs += club.new_msgs;
        }

        function merge_club_inodes(club) {
            _.each(club.msgs, function(m) {
                if (!m.inode) {
                    return;
                }
                m.inode = nbInode.merge_inode(m.inode);
                if (!m.inode.not_mine) {
                    return;
                }
                if (m.original_inode) {
                    return;
                }
                m.original_inode = m.inode;
                nbInode.get_ref_inode(m.inode.id).then(function(inode) {
                    if (!inode) {
                        console.error('no file ref', m.inode.id);
                        return;
                    }
                    m.inode = nbInode.merge_inode(inode);
                }).then(null, function(err) {
                    m.original_inode = null;
                });
            });
        }


        function scroll_club_to_bottom() {
            return $timeout(function() {
                var club_body = $('.club-panel .panel-body')[0];
                if (!club_body) {
                    return;
                }
                // console.log('scroll_club_to_bottom', club_body.scrollTop, club_body.scrollHeight);
                club_body.scrollTop = club_body.scrollHeight;
            }, 0);
        }

        function pick_club_updates(club) {
            return _.pick(club, '_id', 'title', 'members');
        }

        function get_club_for_update(club) {
            return angular.copy(pick_club_updates(club));
        }

        function save_club(club, original_club) {
            var club_data = pick_club_updates(club);
            if (!club_data.title) {
                alertify.error('Missing club title');
                return $q.reject();
            }
            if (!club_data.members.length) {
                alertify.error('Missing club members');
                return $q.reject();
            }
            var club_id;
            original_club.saving = true;
            return $http({
                method: club._id ? 'PUT' : 'POST',
                url: '/api/club/' + (club._id || ''),
                data: club_data
            }).then(function(res) {
                club_id = club._id || res.data.club_id;
                return poll_clubs();
            }).then(function() {
                return get_club(club_id);
            }).then(null, function(err) {
                console.error('FAILED CREATE CLUB', err);
                alertify.error('Oops, we failed to save the changes... internal error:', err);
                throw err;
            })['finally'](function() {
                original_club.saving--;
            });
        }



        function start_club_with_email(email) {
            if (nbUtil.valid_email(email)) {
                add_email_club(email);
                return;
            }
            alertify.prompt('Invite email address', function(e, email) {
                if (!e) {
                    return;
                }
                if (!nbUtil.valid_email(email)) {
                    alertify.error('Not a valid email address');
                    return;
                }
                add_email_club(email);
                $rootScope.safe_apply();
            }, email);
        }

        function add_email_club(email) {
            var id = club_id_gen++;
            merge_club({
                id: id,
                title: email,
                user: {
                    email: email,
                    name: email,
                    first_name: email.split('@')[0].split('.')[0].split('_')[0],
                },
                msgs: []
            });
            goto_club(id);
        }

        var yuval = {};
        var club_id_gen = 1;

        function sample_club() {
            return {
                id: club_id_gen++,
                title: 'Yuval',
                msgs: [{
                    user: yuval,
                    text: 'hula, there?'
                }, {
                    user: yuval,
                    text: 'i have some great news...'
                }, {
                    text: 'i\'m here. what\'s the news???'
                }]
            };
        }

        return $scope;
    }
]);

nb_util.controller('ClubsCtrl', [
    '$scope', '$q', '$location', '$timeout', 'nbUtil', 'nbUser', 'nbInode', 'nbClub',
    function($scope, $q, $location, $timeout, nbUtil, nbUser, nbInode, nbClub) {
        $scope.nbUtil = nbUtil;
        $scope.nbUser = nbUser;
        $scope.nbClub = nbClub;

        nbClub.reset_active_club();
    }
]);

nb_util.controller('ClubCtrl', [
    '$scope', '$q', '$location', '$timeout', '$routeParams',
    'nbUtil', 'nbUser', 'nbInode', 'nbClub',
    function($scope, $q, $location, $timeout, $routeParams,
        nbUtil, nbUser, nbInode, nbClub) {
        $scope.nbUtil = nbUtil;
        $scope.nbUser = nbUser;
        $scope.nbClub = nbClub;

        var club = nbClub.activate_club($routeParams.id);
        if (!club) {
            return;
        }
        $scope.club = club;
        $scope.send_club_text = send_club_text;
        $scope.select_files_to_club = select_files_to_club;
        $scope.upload_files_to_club = upload_files_to_club;

        function send_club_message(msg) {
            $scope.sending_message = true;
            return nbClub.send_club_message(club, msg)['finally'](function() {
                $scope.sending_message = false;
            });
        }

        function send_club_text() {
            if (!club.message_input.length) {
                return;
            }
            return send_club_message({
                text: club.message_input
            }).then(function() {
                club.message_input = '';
            });
        }

        function select_files_to_club() {
            var modal;
            var choose_scope = $scope.$new();
            choose_scope.title = 'Select items to share';
            choose_scope.context = {
                current_inode: $scope.home_context.current_inode,
            };
            choose_scope.dialog = {
                run_caption: 'Share',
                cancel: function() {
                    modal.modal('hide');
                },
                run_disabled: function() {
                    return nbInode.is_not_mine(choose_scope.context.current_inode);
                },
                run: function(selection) {
                    modal.modal('hide');
                    // var selected = selection.get_items();
                    send_club_message({
                        inode: choose_scope.context.current_inode.id
                    });
                }
            };
            modal = nbUtil.make_modal({
                template: 'files_modal.html',
                scope: choose_scope,
            });
        }

        function upload_files_to_club() {
            nbUtil.coming_soon('club.upload', 'Uploading files to club');
        }
    }
]);


nb_util.controller('ClubInfoCtrl', [
    '$scope', '$q', '$location', '$timeout', '$routeParams', '$templateCache', 'nbUtil', 'nbUser', 'nbInode', 'nbClub',
    function($scope, $q, $location, $timeout, $routeParams, $templateCache, nbUtil, nbUser, nbInode, nbClub) {
        $scope.nbUtil = nbUtil;
        $scope.nbUser = nbUser;
        $scope.nbClub = nbClub;


        var club;
        $scope.edit_title = {};
        $scope.$watch('club.title', function(value) {
            $scope.edit_title.value = value;
        });
        init($routeParams.id);

        function init(club_id) {
            if (club_id) {
                $scope.club = club = nbClub.get_club_or_redirect(club_id);
                $scope.is_new = false;
            } else {
                $scope.club = club = angular.copy(nbClub.NEW_CLUB_OBJ);
                $scope.is_new = true;
            }
            if (club && club.admin) {
                $scope.edit_title.on = $scope.is_new;
            } else {
                delete $scope.edit_title.on;
            }
        }


        $scope.back = function() {
            if (!$scope.is_new || angular.equals(club, nbClub.NEW_CLUB_OBJ)) {
                nbClub.goto_club(club._id);
                return;
            }
            alertify.confirm('Discard changes?', function(e) {
                if (!e) return;
                nbClub.goto_club(club._id);
                $scope.safe_apply();
            });
        };

        $scope.save_club = function() {
            var update_club = nbClub.get_club_for_update(club);
            update_club.title = $scope.edit_title.value;
            return nbClub.save_club(update_club, club).then(function(saved_club) {
                nbClub.goto_club(saved_club._id);
            });
        };

        $scope.update_title = function() {
            if ($scope.edit_title.value === club.title) {
                $scope.edit_title.on = false;
                return;
            }
            var update_club = nbClub.get_club_for_update(club);
            update_club.title = $scope.edit_title.value;
            return nbClub.save_club(update_club, club).then(function() {
                init(club._id);
            })['finally'](function() {
                $scope.edit_title.on = false;
            });
        };

        $scope.add_member = function() {
            var html = ['<div class="modal" ng-controller="ClubMemberCtrl">',
                '<div class="modal-dialog">',
                '<div class="modal-content">',
                '<div class="modal-body" style="padding: 0">',
                $templateCache.get('friend_chooser.html'),
                '</div>',
                '</div>',
                '</div>',
                '</div>'
            ].join('\n');
            var modal;
            var scope = $scope.$new();
            scope.back = function() {
                modal.modal('hide');
            };
            scope.choose = function(friend) {
                modal.modal('hide');
                if ($scope.is_new) {
                    club.members.push({
                        user: friend.id,
                        user_info: friend
                    });
                    return;
                }
                var update_club = nbClub.get_club_for_update(club);
                update_club.members.push({
                    user: friend.id,
                    user_info: friend
                });
                return nbClub.save_club(update_club, club).then(function() {
                    init(club._id);
                });
            };
            modal = nbUtil.make_modal({
                // template: 'friend_chooser.html',
                html: html,
                scope: scope
            });
        };

        $scope.remove_member = function(index) {
            alertify.confirm('Remove member?', function(e) {
                if (!e) return;
                if ($scope.is_new) {
                    club.members.splice(index, 1);
                    $scope.safe_apply();
                    return;
                }
                var update_club = nbClub.get_club_for_update(club);
                update_club.members.splice(index, 1);
                $scope.safe_apply();
                return nbClub.save_club(update_club, club).then(function() {
                    init(club._id);
                });
            });
        };

        $scope.leave_club = function() {
            nbUtil.coming_soon('club.leave', 'Leaving club');
        };
    }
]);

nb_util.controller('ClubMemberCtrl', [
    '$scope', '$q', '$location', '$timeout', 'nbUtil', 'nbUser', 'nbInode', 'nbClub',
    function($scope, $q, $location, $timeout, nbUtil, nbUser, nbInode, nbClub) {
        $scope.nbUtil = nbUtil;
        $scope.nbUser = nbUser;
        $scope.nbClub = nbClub;

        var club = $scope.club;

        var members_by_id = _.indexBy(club.members, 'user');
        var members_by_fbid = _.indexBy(club.members, 'user_info.fbid');
        var members_by_googleid = _.indexBy(club.members, 'user_info.googleid');

        $scope.was_chosen = function(friend) {
            if (friend.id) {
                return !!members_by_id[friend.id];
            }
            if (friend.fbid) {
                return !!members_by_fbid[friend.fbid];
            }
            if (friend.googleid) {
                return !!members_by_googleid[friend.googleid];
            }
            return false;
        };

        $scope.choose_friend = function(friend) {
            if (!$scope.was_chosen(friend)) {
                $scope.choose(friend);
            }
        };

        // These are expected to be defined by parent scope
        // $scope.back = function()
        // $scope.choose = function(friend)
    }
]);
