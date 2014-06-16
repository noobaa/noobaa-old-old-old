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
            reset_active_club: reset_active_club,
            set_active_club: set_active_club,
            activate_club: activate_club,
            goto_clubs: goto_clubs,
            goto_club: goto_club,
            goto_club_info: goto_club_info,
            goto_add_member: goto_add_member,
            create_new_club: create_new_club,
            save_club: save_club,
            start_club_with_email: start_club_with_email,
            send_club_message: send_club_message,
            scroll_club_to_bottom: scroll_club_to_bottom,
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

        poll_clubs();



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
                _.each(clubs, update_club);
                $scope.last_poll = clubs[0].mtime;
                console.log('POLL', clubs.length, $scope.last_poll);
            })['finally'](function() {
                $scope.poll_in_progress = null;
                $scope.poll_timeout = $timeout(poll_clubs, 10000);
            });
            return $scope.poll_in_progress;
        }

        function update_club(club) {
            club.mtime_date = new Date(club.mtime);
            var c = $scope.clubs[club._id];
            if (c) {
                var msgs = c.msgs || [];
                msgs = msgs.concat(club.msgs);
                msgs = _.sortBy(msgs, function(m) {
                    return m._id;
                });
                msgs = _.uniq(msgs, true, function(m) {
                    return m._id;
                });
                _.extend(c, club);
                c.msgs = msgs;
                console.log('UPDATE EXISTING CLUB', c);
            } else {
                c = club;
                $scope.clubs[c._id] = c;
                console.log('UPDATE NEW CLUB', c);
            }
            $q.when(nbUser.init_friends()).then(function() {
                _.each(club.members, function(m) {
                    if (m.user_info) {
                        return;
                    }
                    if (m.user == nbUser.user.id) {
                        m.user_info = nbUser.user;
                    } else {
                        m.user_info = nbUser.get_friend_by_id(m.user);
                    }
                });
            });
            count_new_msgs(c);
            if ($scope.active_club === c) {
                touch_club();
            }
            return c;
        }



        function get_club(id) {
            return $scope.clubs[id];
        }

        function reset_active_club() {
            $scope.active_club = null;
        }

        function set_active_club(club_id) {
            $scope.active_club = get_club(club_id);
            if (!$scope.active_club) {
                $location.path('/club/');
                return;
            }
            return $scope.active_club;
        }

        function activate_club(club_id) {
            if (!set_active_club(club_id)) {
                return;
            }
            merge_club_inodes($scope.active_club);
            touch_club();
            return $scope.active_club;
        }


        function goto_clubs() {
            $location.path('/club/');
        }

        function goto_club(club_id) {
            $location.path('/club/' + club_id);
        }

        function goto_club_info(club_id) {
            $location.path('/club/info/' + club_id);
        }

        function goto_add_member() {
            $location.path('/club/member');
        }


        function touch_club() {
            $q.when(mark_seen($scope.active_club)).then(scroll_club_to_bottom);
        }

        function send_club_message(club, msg) {
            return $http({
                method: 'POST',
                url: '/api/club/' + club._id + '/msg',
                data: {
                    text: msg.text,
                    inode: msg.inode
                }
            }).then(poll_clubs).then(scroll_club_to_bottom).then(touch_club);
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
            console.log('MARK SEEN', prev_msg_id, '->', last_msg_id);
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
                if (club.msgs[club.msgs.length - i - 1]._id === club.seen_msg) {
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
                console.log('scroll_club_to_bottom', club_body.scrollTop, club_body.scrollHeight);
                club_body.scrollTop = club_body.scrollHeight;
            }, 0);
        }


        function create_new_club(club) {
            if (!club.title) {
                return alertify.error('Missing club title');
            }
            if (!club.members.length) {
                return alertify.error('Missing club members');
            }
            var club_id;
            return $http({
                method: 'POST',
                url: '/api/club/',
                data: club
            }).then(function(res) {
                club_id = res.data.club_id;
                return poll_clubs();
            }).then(function() {
                goto_club(club_id);
            }).then(null, function(err) {
                console.error('FAILED CREATE CLUB', err);
            });
        }

        function save_club(club) {
            alertify.log('TODO save_club');
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
            update_club({
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
            choose_scope.count = 0;
            choose_scope.context = {
                current_inode: $scope.home_context.current_inode,
                dir_only: false
            };
            choose_scope.run_disabled = function() {
                return nbInode.is_not_mine(choose_scope.context.current_inode);
            };
            choose_scope.run = function() {
                modal.modal('hide');
                send_club_message({
                    inode: choose_scope.context.current_inode.id
                });
            };
            choose_scope.title = 'Attach Files';
            modal = nbUtil.make_modal({
                template: 'chooser_modal.html',
                scope: choose_scope,
            });
        }

        function upload_files_to_club() {
            alertify.log('TODO upload_files_to_club');
        }
    }
]);

nb_util.controller('NewClubCtrl', [
    '$scope', '$q', '$location', '$timeout', 'nbUtil', 'nbUser', 'nbInode', 'nbClub',
    function($scope, $q, $location, $timeout, nbUtil, nbUser, nbInode, nbClub) {
        $scope.nbUtil = nbUtil;
        $scope.nbUser = nbUser;
        $scope.nbClub = nbClub;

        var club = angular.copy(nbClub.NEW_CLUB_OBJ);
        $scope.club = club;
        $scope.is_new = true;

        $scope.back = function() {
            if (angular.equals(club, nbClub.NEW_CLUB_OBJ)) {
                nbClub.goto_clubs();
                return;
            }
            alertify.confirm('Discard changes?', function(e) {
                if (!e) return;
                nbClub.goto_clubs();
                $scope.safe_apply();
            });
        };

        $scope.remove_member = function(index) {
            alertify.confirm('Remove member?', function(e) {
                if (!e) return;
                club.members.splice(index, 1);
                $scope.safe_apply();
            });
        };

        $scope.save_club = function() {
            return nbClub.create_new_club(club);
        };
    }
]);

nb_util.controller('ClubInfoCtrl', [
    '$scope', '$q', '$location', '$timeout', '$routeParams', 'nbUtil', 'nbUser', 'nbInode', 'nbClub',
    function($scope, $q, $location, $timeout, $routeParams, nbUtil, nbUser, nbInode, nbClub) {
        $scope.nbUtil = nbUtil;
        $scope.nbUser = nbUser;
        $scope.nbClub = nbClub;

        var edit_club = nbClub.set_active_club($routeParams.id);
        if (!edit_club) {
            return;
        }
        var club = $scope.club = angular.copy(edit_club);

        $scope.back = function() {
            if (angular.equals(club, edit_club)) {
                nbClub.goto_clubs();
                return;
            }
            alertify.confirm('Discard changes?', function(e) {
                if (!e) return;
                nbClub.goto_clubs();
                $scope.safe_apply();
            });
        };

        $scope.remove_member = function(index) {
            alertify.confirm('Remove member?', function(e) {
                if (!e) return;
                club.members.splice(index, 1);
                $scope.safe_apply();
            });
        };

        $scope.save_club = function() {
            nbClub.save_club(club);
        };
    }
]);

nb_util.controller('ClubMemberCtrl', [
    '$scope', '$q', '$location', '$timeout', 'nbUtil', 'nbUser', 'nbInode', 'nbClub',
    function($scope, $q, $location, $timeout, nbUtil, nbUser, nbInode, nbClub) {
        $scope.nbUtil = nbUtil;
        $scope.nbUser = nbUser;
        $scope.nbClub = nbClub;

        var club = nbClub.active_club;

        var members_by_id = _.indexBy(club.members, 'id');
        var members_by_fbid = _.indexBy(club.members, 'fbid');
        var members_by_googleid = _.indexBy(club.members, 'googleid');

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

        $scope.back = function() {
            nbClub.goto_club_info(club.id);
        };

        $scope.choose_friend = function(friend) {
            if ($scope.was_chosen(friend)) {
                return;
            }
            console.log('CHOOSE FRIEND', friend);
            club.members.push(friend);
            $scope.back();
        };

    }
]);
