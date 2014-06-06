'use strict';

var _ = require('underscore');
var moment = require('moment');

var nb_util = angular.module('nb_util');



nb_util.factory('nbChat', [
    '$http', '$timeout', '$interval', '$q',
    '$window', '$location', '$rootScope',
    'nbUtil', 'nbUser', 'nbInode',

    function($http, $timeout, $interval, $q,
        $window, $location, $rootScope,
        nbUtil, nbUser, nbInode) {

        var $scope = {
            chats: {},
            chats_by_user: {},
            last_poll: 0,
            get_chat: get_chat,
            open_chats: open_chats,
            open_chat: open_chat,
            activate_chat: activate_chat,
            start_chat_with_friend: start_chat_with_friend,
            start_chat_with_email: start_chat_with_email,
            send_chat_message: send_chat_message,
            scroll_chat_to_bottom: scroll_chat_to_bottom,
        };

        $rootScope.$watch(function() {
            // the watch function checks change by max mtime
            return _.max($scope.chats, function(c) {
                return c.mtime_date.getTime();
            }).mtime_date;
        }, function() {
            // sort the chats by mtime
            $scope.chats_arr = _.sortBy($scope.chats, function(c) {
                return -c.mtime_date.getTime();
            });
        });


        function poll_chats() {
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
                url: '/api/chat/',
                params: {
                    last_poll: $scope.last_poll
                }
            }).then(function(res) {
                var chats = res.data.chats;
                if (!chats || !chats.length) {
                    return;
                }
                _.each(chats, update_chat);
                $scope.last_poll = chats[0].mtime;
                console.log('POLL', chats.length, $scope.last_poll);
            })['finally'](function() {
                $scope.poll_in_progress = null;
                $scope.poll_timeout = $timeout(poll_chats, 10000);
            });
            return $scope.poll_in_progress;
        }

        function update_chat(chat) {
            chat.mtime_date = new Date(chat.mtime);
            var c = $scope.chats[chat._id];
            if (c) {
                var msgs = c.msgs || [];
                msgs = msgs.concat(chat.msgs);
                msgs = _.sortBy(msgs, function(m) {
                    return m._id;
                });
                msgs = _.uniq(msgs, true, function(m) {
                    return m._id;
                });
                _.extend(c, chat);
                c.msgs = msgs;
                console.log('UPDATE EXISTING CHAT', c);
            } else {
                c = chat;
                $scope.chats[c._id] = c;
                console.log('UPDATE NEW CHAT', c);
            }
            if (c.user_id) {
                var cc = $scope.chats_by_user[c.user_id];
                if (!cc || cc.mtime_date.getTime() < c.mtime_date.getTime()) {
                    $scope.chats_by_user[c.user_id] = c;
                }
                $q.when(nbUser.init_friends()).then(function() {
                    c.user = nbUser.get_friend_by_id(c.user_id);
                    c.title = c.user ? c.user.name : '';
                });
            }
            count_new_msgs(c);
            if ($scope.active_chat === c) {
                touch_chat();
            }
            return c;
        }

        poll_chats();


        function get_chat(id) {
            return $scope.chats[id];
        }

        function open_chats() {
            $scope.active_chat = null;
            $location.path('/chat/');
        }

        function open_chat(chat_id) {
            $location.path('/chat/' + chat_id);
        }

        function activate_chat(chat_id) {
            $scope.active_chat = get_chat(chat_id);
            if (!$scope.active_chat) {
                open_chats();
                return;
            }
            touch_chat();
            return $scope.active_chat;
        }

        function touch_chat() {
            $q.when(mark_seen($scope.active_chat)).then(scroll_chat_to_bottom);
        }

        function send_chat_message(chat, msg) {
            return $http({
                method: 'POST',
                url: '/api/chat/' + chat._id + '/msg',
                data: {
                    text: msg.text,
                    inode: msg.inode
                }
            }).then(poll_chats).then(scroll_chat_to_bottom).then(touch_chat);
        }

        function mark_seen(chat) {
            if (!chat.msgs || !chat.msgs.length) {
                return;
            }
            var last_msg_id = chat.msgs[chat.msgs.length - 1]._id;
            var prev_msg_id = chat.seen_msg;
            if (prev_msg_id === last_msg_id) {
                return;
            }
            console.log('MARK SEEN', prev_msg_id, '->', last_msg_id);
            return $http({
                method: 'PUT',
                url: '/api/chat/' + chat._id + '/msg',
                data: {
                    seen_msg: last_msg_id
                }
            }).then(function() {
                if (chat.seen_msg === prev_msg_id) {
                    chat.seen_msg = last_msg_id;
                    count_new_msgs(chat);
                }
            });
        }

        $scope.total_new_msgs = 0;

        function count_new_msgs(chat) {
            if (!chat.msgs) {
                return;
            }
            $scope.total_new_msgs -= (chat.new_msgs || 0);
            if (!chat.seen_msg) {
                chat.new_msgs = chat.msgs.length;
                $scope.total_new_msgs += chat.new_msgs;
                return;
            }
            for (var i = 0; i < chat.msgs.length; i++) {
                if (chat.msgs[chat.msgs.length - i - 1]._id === chat.seen_msg) {
                    break;
                }
            }
            chat.new_msgs = i;
            $scope.total_new_msgs += chat.new_msgs;
        }



        function scroll_chat_to_bottom() {
            return $timeout(function() {
                var chat_body = $('.chat-panel .panel-body')[0];
                if (!chat_body) {
                    return;
                }
                console.log('scroll_chat_to_bottom', chat_body.scrollTop, chat_body.scrollHeight);
                chat_body.scrollTop = chat_body.scrollHeight;
            }, 0);
        }




        function start_chat_with_friend(friend) {
            var chat = $scope.chats_by_user[friend.id];
            if (chat) {
                open_chat(chat._id);
                return;
            }
            var chat_id;
            return $http({
                method: 'POST',
                url: '/api/chat/',
                data: {
                    users_list: [nbUser.user.id, friend.id]
                }
            }).then(function(res) {
                chat_id = res.data.chat_id;
                return poll_chats();
            }).then(function() {
                open_chat(chat_id);
            }).then(null, function(err) {
                console.error('FAILED CREATE CHAT', err);
            });
        }


        function start_chat_with_email(email) {
            if (nbUtil.valid_email(email)) {
                add_email_chat(email);
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
                add_email_chat(email);
                $rootScope.safe_apply();
            }, email);
        }

        function add_email_chat(email) {
            var id = chat_id_gen++;
            update_chat({
                id: id,
                title: email,
                user: {
                    email: email,
                    name: email,
                    first_name: email.split('@')[0].split('.')[0].split('_')[0],
                },
                msgs: []
            });
            open_chat(id);
        }

        var yuval = {};
        var chat_id_gen = 1;

        function sample_chat() {
            return {
                id: chat_id_gen++,
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

nb_util.controller('ChatsCtrl', [
    '$scope', '$q', '$location', '$timeout', 'nbUtil', 'nbUser', 'nbInode', 'nbChat',
    function($scope, $q, $location, $timeout, nbUtil, nbUser, nbInode, nbChat) {
        $scope.nbUtil = nbUtil;
        $scope.nbUser = nbUser;
        $scope.nbChat = nbChat;

        nbUser.init_friends();

        $scope.starting_chat = false;

        $scope.set_start_chat = function() {
            $scope.starting_chat = true;
        };

        $scope.clear_start_chat = function() {
            $scope.starting_chat = false;
            $scope.start_chat_input = '';
        };

        $scope.$on('$locationChangeStart', function(event) {
            if (!$scope.starting_chat) {
                return;
            }
            $scope.clear_start_chat();
            event.preventDefault();
        });

        $scope.open_chat = function(chat_id) {
            $scope.starting_chat = false;
            nbChat.open_chat(chat_id);
        };
        $scope.start_chat_with_friend = function(friend) {
            $scope.starting_chat = false;
            nbChat.start_chat_with_friend(friend);
        };
        $scope.start_chat_with_email = function(email) {
            $scope.starting_chat = false;
            nbChat.start_chat_with_email(email);
        };
    }
]);

nb_util.controller('ChatCtrl', [
    '$scope', '$q', '$location', '$timeout', '$routeParams',
    'nbUtil', 'nbUser', 'nbInode', 'nbChat',
    function($scope, $q, $location, $timeout, $routeParams,
        nbUtil, nbUser, nbInode, nbChat) {
        $scope.nbUtil = nbUtil;
        $scope.nbUser = nbUser;
        $scope.nbChat = nbChat;

        var chat = nbChat.activate_chat($routeParams.id);
        $scope.chat = chat;
        $scope.send_chat_text = send_chat_text;
        $scope.select_files_to_chat = select_files_to_chat;
        $scope.upload_files_to_chat = upload_files_to_chat;
        $scope.open_chat_inode = open_chat_inode;

        function open_chat_inode(inode) {
            $location.path('/files/' + inode.id);
        }

        function send_chat_message(msg) {
            $scope.sending_message = true;
            return nbChat.send_chat_message(chat, msg)['finally'](function() {
                $scope.sending_message = false;
            });
        }

        function send_chat_text() {
            if (!chat.message_input.length) {
                return;
            }
            return send_chat_message({
                text: chat.message_input
            }).then(function() {
                chat.message_input = '';
            });
        }

        function select_files_to_chat() {
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
                send_chat_message({
                    inode: choose_scope.context.current_inode._id
                });
            };
            choose_scope.title = 'Attach Files';
            modal = nbUtil.make_modal({
                template: 'chooser_modal.html',
                scope: choose_scope,
            });
        }

        function upload_files_to_chat() {
            alertify.log('TODO upload_files_to_chat');
        }
    }
]);
