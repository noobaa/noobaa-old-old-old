'use strict';

var _ = require('underscore');
var moment = require('moment');

var nb_util = angular.module('nb_util');



nb_util.factory('nbClub', [
    '$http', '$timeout', '$interval', '$q',
    '$window', '$location', '$rootScope',
    'nbUtil', 'nbUser', 'nbInode', 'nbNotify',

    function($http, $timeout, $interval, $q,
        $window, $location, $rootScope,
        nbUtil, nbUser, nbInode, nbNotify) {

        var $scope = {
            get_club: get_club,
            get_club_or_redirect: get_club_or_redirect,
            poll_clubs: poll_clubs,
            goto_clubs: goto_clubs,
            goto_club: goto_club,
            mark_seen: mark_seen,
            create_new_club: create_new_club,
            update_club: update_club,
            send_club_message: send_club_message,
            // objects
            clubs: {},
            last_poll: 0,
            poll_progress_percent: 0,
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
            notifier: new nbNotify.Notifier('clubs')
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

        // a promise for controllers to know when the initial load is done
        $scope.init_promise = $q.when(nbUser.init_friends()).then(poll_clubs).then(function() {
            $scope.clubs_inited = true;
        });


        function poll_clubs() {
            var new_last_poll;
            if ($scope.poll_in_progress) {
                return $scope.poll_in_progress;
            }
            if ($scope.poll_timeout) {
                $timeout.cancel($scope.poll_timeout);
                $scope.poll_timeout = null;
            }
            $scope.poll_progress_percent = 0;
            $timeout(function() {
                if ($scope.poll_progress_percent < 33) {
                    $scope.poll_progress_percent = 33;
                }
            }, 500);
            $scope.poll_in_progress = $http({
                method: 'GET',
                url: '/api/club/',
                params: {
                    last_poll: $scope.last_poll
                }
            }).then(function(res) {
                $scope.poll_progress_percent = 66;
                var clubs = res.data.clubs;
                if (!clubs || !clubs.length) {
                    return;
                }
                _.each(clubs, merge_club);
                $scope.last_poll = clubs[0].mtime;
                console.log('POLL', clubs.length, $scope.last_poll);
            })['finally'](function() {
                $scope.poll_progress_percent = 100;
                $scope.poll_in_progress = $timeout(function() {
                    $scope.poll_progress_percent = 0;
                    $scope.poll_in_progress = null;
                    $scope.poll_timeout = $timeout(poll_clubs, 10000);
                }, 500); // short delay for progress animation
            });
            return $scope.poll_in_progress;
        }

        function merge_club(club) {
            club.mtime_date = new Date(club.mtime);
            _.each(club.msgs, set_message_info);
            var c = $scope.clubs[club._id];
            if (c) {
                var new_msgs = club.msgs || [];
                var msgs = c.msgs || [];
                msgs = msgs.concat(new_msgs);
                // filter out pending msgs which are inserted on send
                // there is a small race here if poll occurs before send completes,
                // but it's small so trying to ignore for now.
                msgs = _.filter(msgs, function(m) {
                    return !m.pending;
                });
                msgs = _.uniq(msgs, function(m) {
                    return m._id;
                });
                _.extend(c, club);
                c.msgs = msgs;
                // console.log('GOT EXISTING CLUB', c);
            } else {
                c = club;
                $scope.clubs[c._id] = c;
                if (!c.color) {
                    // TODO save color in club (DB)
                    c.color = Math.floor(Math.random() * 360);
                }
                // console.log('GOT NEW CLUB', c);
            }
            _.each(c.members, set_user_info);
            count_new_msgs(c);
            return c;
        }

        function set_message_info(m) {
            set_user_info(m);
            merge_club_inode(m);
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

        function goto_clubs() {
            $location.path('/club/');
        }

        function goto_club(club_id) {
            $location.path('/club/' + (club_id || ''));
        }

        function send_club_message(club, msg) {
            // insert the message immediately into the local list.
            club.msgs.push(msg);
            // mark the msg as sending so that merge will know it's still being sent
            msg.sending = true;
            // set the user to me so that it will not be counted as a new message for notifications.
            msg.user = nbUser.user.id;
            return $http({
                method: 'POST',
                url: '/api/club/' + club._id + '/msg',
                data: {
                    text: msg.text,
                    inode: msg.inode
                }
            })['finally'](function() {
                msg.sending = false;
                // mark the msg as pending to filter it out on next poll.
                msg.pending = true;
            }).then(poll_clubs).then(function() {
                return mark_seen(club);
            });
        }

        function mark_seen(club) {
            if (!club.msgs || !club.msgs.length) {
                return;
            }
            var last_msg_id = club.msgs[club.msgs.length - 1]._id;
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
            var len = club.msgs.length;
            $scope.total_new_msgs -= (club.new_msgs || 0);
            var count = 0;
            if (!club.seen_msg) {
                // all messages are considered new
                count = len;
            } else {
                // go back and look for the last seen msg
                // count all messages not sent by me
                for (var i = 0; i < len; i++) {
                    var m = club.msgs[len - i - 1];
                    if (m._id === club.seen_msg) {
                        break;
                    }
                    if (!m.sending && !m.pending && m.user !== nbUser.user.id) {
                        count++;
                    }
                }
            }
            // we counted the messages till the seen one, 
            // each of these is considered an unseen message
            club.new_msgs = count;
            if (club.new_msgs) {
                $scope.notifier.notify(club.title, {
                    body: club.new_msgs + ' new club messages',
                    tag: club._id,
                }, {
                    onclick: function() {
                        goto_club(club._id);
                        this.close();
                    }
                });
            }
            $scope.total_new_msgs += club.new_msgs;
        }

        function merge_club_inodes(club) {
            _.each(club.msgs, merge_club_inode);
        }

        function merge_club_inode(m) {
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
                console.error('FAIED MERGE CLUB INODE', err);
                // TODO retry?
                m.original_inode = null;
            });
        }

        function create_new_club() {
            alertify.prompt('Enter title for the new club:', function(e, title) {
                if (!e) {
                    nbUtil.track_event('club.create_canceled');
                    return;
                }
                nbUtil.track_event('club.create');
                var club_data = angular.copy($scope.NEW_CLUB_OBJ);
                club_data.title = title;
                return create_club(club_data);
            }, nbUser.user.first_name + '\'s favorite videos...');
        }

        function create_club(club_data) {
            var club_id;
            return $http({
                method: 'POST',
                url: '/api/club/',
                data: club_data
            }).then(function(res) {
                club_id = res.data.club_id;
                return poll_clubs();
            }).then(function() {
                goto_club(club_id);
            }).then(null, function(err) {
                console.error('FAILED CREATE CLUB', err);
                alertify.error('Oops, we failed to save the changes... internal error:', err);
                throw err;
            });
        }

        function update_club(club, updates) {
            club.during_update = true;
            return $http({
                method: 'PUT',
                url: '/api/club/' + club._id,
                data: updates
            }).then(function(res) {
                return poll_clubs();
            }).then(null, function(err) {
                console.error('FAILED CREATE CLUB', err);
                alertify.error('Oops, we failed to save the changes... internal error:', err);
                throw err;
            })['finally'](function() {
                club.during_update = false;
            });
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

        nbUtil.track_event('clubs.list');

        $scope.action_bar_title = 'CLUBS';
        /*
        $scope.$watch('nbClub.poll_progress_percent', function(val) {
            $scope.action_bar_progress_percent = val;
        });
        $scope.$watch('nbClub.poll_in_progress', function(val) {
            $scope.action_bar_progress_complete = !val;
        });
        */
    }
]);

nb_util.controller('ClubCtrl', [
    '$scope', '$q', '$location', '$timeout', '$routeParams', '$templateCache',
    'nbUtil', 'nbUser', 'nbInode', 'nbClub',
    function($scope, $q, $location, $timeout, $routeParams, $templateCache,
        nbUtil, nbUser, nbInode, nbClub) {
        $scope.nbUtil = nbUtil;
        $scope.nbUser = nbUser;
        $scope.nbClub = nbClub;

        $scope.action_bar_title = 'CLUBS';

        var club_id = $routeParams.id;
        var club;

        nbUtil.track_event('club.enter');

        nbClub.init_promise.then(function() {
            $scope.club = club = nbClub.get_club_or_redirect(club_id);
            if (!club) {
                // redirect is in progress
                return;
            }
            $scope.last_seen_msg = club.seen_msg;
            nbClub.mark_seen(club);
        });

        $scope.click_msg = function(msg_index) {
            // TODO
        };

        $scope.input_focus = true;

        $scope.send_club_text = function() {
            if (!club.message_input.length) {
                return;
            }
            nbUtil.track_event('club.send_text');
            var text = club.message_input;
            club.message_input = '';
            $scope.input_focus = false;
            return nbClub.send_club_message(club, {
                text: text
            }).then(function() {
                $scope.input_focus = true;
            });
        };

        $scope.select_files_to_club = function() {
            nbUtil.track_event('club.choose_inode');
            var modal;
            var choose_scope = $scope.$new();
            choose_scope.title = 'Select items to share';
            choose_scope.context = {
                current_inode: $scope.home_context.current_inode,
            };
            choose_scope.dialog = {
                run_caption: 'SHARE',
                cancel: function() {
                    modal.modal('hide');
                },
                run: function(selection) {
                    var i;
                    var items;
                    if (!selection.is_empty()) {
                        items = selection.get_items();
                    } else {
                        items = [choose_scope.context.current_inode];
                    }
                    for (i = 0; i < items.length; i++) {
                        if (!nbInode.can_share_inode(items[i])) {
                            alertify.error('Cannot share ' + items[i].name);
                            return;
                        }
                    }
                    modal.modal('hide');
                    for (i = 0; i < items.length; i++) {
                        nbUtil.track_event('club.send_inode', {
                            kind: items[i].content_kind
                        });
                        nbClub.send_club_message(club, {
                            inode: items[i].id
                        });
                    }
                }
            };
            modal = nbUtil.make_modal({
                template: 'files_modal.html',
                scope: choose_scope,
                size: 'fullscreen',
            });
        };

        $scope.upload_files_to_club = function() {
            nbUtil.coming_soon('Upload files to club', 'club.upload');
        };

        $scope.change_club_title = function() {
            alertify.prompt('Enter title for club:', function(e, title) {
                if (!e) return;
                nbUtil.track_event('club.update.title');
                return nbClub.update_club(club, {
                    title: title
                });
            }, club.title);
        };

        $scope.change_club_color = function() {
            if (!club.admin) {
                return;
            }
            var modal;
            var scope = $scope.$new();
            scope.color = club.color;
            scope.back = function() {
                modal.modal('hide');
            };
            scope.change_color = function(change) {
                if (!change) {
                    scope.color = Math.floor(Math.random() * 360);
                } else {
                    scope.color = Math.floor((scope.color + (5 * change)) % 360);
                }
            };
            scope.choose = function() {
                modal.modal('hide');
                nbUtil.track_event('club.update.color');
                return nbClub.update_club(club, {
                    color: scope.color
                }).then(function() {
                    club.color = scope.color;
                });
            };
            modal = nbUtil.make_modal({
                scope: scope,
                html: nbUtil.modal_body_wrap({
                    template: 'color_chooser.html'
                }),
            });
        };

        function pick_member_fields(member) {
            return _.pick(member, 'user', 'admin');
        }

        $scope.add_member = function() {
            var modal;
            var scope = $scope.$new();
            scope.back = function() {
                modal.modal('hide');
            };
            scope.choose = function(friend) {
                modal.modal('hide');
                if (!friend.id) {
                    nbUtil.coming_soon('Invite to club', 'club.invite');
                    return;
                }
                nbUtil.track_event('club.add_member');
                var members = _.map(club.members, pick_member_fields);
                members.push({
                    user: friend.id,
                });
                return nbClub.update_club(club, {
                    members: members
                }).then(function() {
                    alertify.success(friend.first_name + ' is now a member');
                });
            };
            modal = nbUtil.make_modal({
                scope: scope,
                html: nbUtil.modal_body_wrap({
                    template: 'friend_chooser.html',
                    controller: 'ClubMemberCtrl',
                }),
            });
        };

        $scope.remove_member = function(member) {
            alertify.confirm('Remove member?', function(e) {
                if (!e) return;
                nbUtil.track_event('club.remove_member');
                var members = _.map(
                    _.without(club.members, member),
                    pick_member_fields);
                return nbClub.update_club(club, {
                    members: members
                }).then(function() {
                    alertify.success(member.user_info.first_name + ' is no longer a member');
                });
            });
        };

        $scope.show_members = function() {
            nbUtil.track_event('club.show_members');
            var modal;
            var scope = $scope.$new();
            scope.back = function() {
                modal.modal('hide');
            };
            scope.add_member = function() {
                modal.modal('hide');
                $scope.add_member();
            };
            modal = nbUtil.make_modal({
                scope: scope,
                html: nbUtil.modal_body_wrap({
                    template: 'club_members.html',
                }),
            });
        };

        $scope.prev_club = function() {
            var index = _.indexOf(nbClub.clubs_arr, club);
            console.log('PREV CLUB', index);
            if (index <= 0) {
                alertify.log('Reached first club...');
                return;
            }
            var c = nbClub.clubs_arr[index - 1];
            nbClub.goto_club(c._id);
        };

        $scope.next_club = function() {
            var index = _.indexOf(nbClub.clubs_arr, club);
            console.log('NEXT CLUB', index);
            if (index + 1 >= nbClub.clubs_arr.length) {
                alertify.log('Reached last club...');
                return;
            }
            var c = nbClub.clubs_arr[index + 1];
            nbClub.goto_club(c._id);
        };

        $scope.leave_club = function() {
            nbUtil.coming_soon('Leave club', 'club.leave');
        };

        $scope.click_inode = function(inode, index, event) {
            nbUtil.track_event('club.click_inode');
            if (nbInode.play_inode(inode)) {
                return;
            }
            $location.path('/files/' + inode.id);
        };

    }
]);

nb_util.controller('ClubMemberCtrl', [
    '$scope', '$q', '$location', '$timeout', 'nbUtil', 'nbUser', 'nbInode', 'nbClub',
    function($scope, $q, $location, $timeout, nbUtil, nbUser, nbInode, nbClub) {
        $scope.nbUtil = nbUtil;
        $scope.nbUser = nbUser;
        $scope.nbClub = nbClub;

        // this scope is assumed to work as an inner scope of a parent club scope
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

        $scope.choose_friend_email = function(email) {
            return nbUtil.coming_soon('Inviting friend by email', 'club.invite_email');
        };

        // These are expected to be defined by parent scope
        // $scope.back = function()
        // $scope.choose = function(friend)
    }
]);
