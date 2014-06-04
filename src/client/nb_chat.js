'use strict';

var _ = require('underscore');
var moment = require('moment');

var nb_util = angular.module('nb_util');



nb_util.factory('nbChat', [
    '$http', '$timeout', '$interval', '$q', '$window', '$location', '$rootScope', '$sce', '$sanitize',
    'LinkedList', 'JobQueue', 'nbUtil', 'nbUser', 'nbInode',

    function($http, $timeout, $interval, $q, $window, $location, $rootScope, $sce, $sanitize,
        LinkedList, JobQueue, nbUtil, nbUser, nbInode) {

        var $scope = {
            chats: {},
            last_poll: 0,
            get_chat_by_id: get_chat_by_id,
            open_chat: open_chat,
            start_chat_with_friend: start_chat_with_friend,
            start_chat_with_email: start_chat_with_email,
            send_chat_message: send_chat_message,
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
                url: '/api/chat/poll/',
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
                var msgs = c.msgs.concat(chat.msgs);
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
            return c;
        }

        poll_chats();

        /*
        function list_chats() {
            return $http({
                method: 'GET',
                url: '/api/chat/'
            }).then(function(res) {
                $scope.chats = _.indexBy(res.data, '_id');
            }).then(null, function(err) {
                console.error('FAILED LIST CHATS', err);
                return $timeout(list_chats, 5000);
            });
        }


        function read_chat(chat_id) {
            var chat = get_chat_by_id(chat_id);
            return $http({
                method: 'GET',
                url: '/api/chat/' + chat_id + '/msg',
                params: {
                    ctime: chat ? chat.ctime : null,
                }
            }).then(function(res) {
                if (!chat) {
                    chat = add_chat(res.data.chat);
                }
                chat.msgs = res.data.msgs;
            });
        }
        */


        function get_chat_by_id(id) {
            return $scope.chats[id];
        }


        function open_chat(chat) {
            open_chat_by_id(chat._id);
        }

        function open_chat_by_id(id) {
            $location.path('/chat/' + id);
        }


        function start_chat_with_friend(friend) {
            var chat_id;
            return $http({
                method: 'POST',
                url: '/api/chat/',
                data: {
                    title: friend.name,
                    users_list: [nbUser.user.id, friend.id]
                }
            }).then(function(res) {
                chat_id = res.data.chat_id;
                return poll_chats();
            }).then(function() {
                open_chat_by_id(chat_id);
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
            open_chat_by_id(id);
        }

        function send_chat_message(chat, msg) {
            return $http({
                method: 'POST',
                url: '/api/chat/' + chat._id + '/msg',
                data: {
                    text: msg.text,
                    inode: msg.inode
                }
            }).then(poll_chats);
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
    }
]);

nb_util.controller('ChatCtrl', [
    '$scope', '$q', '$location', '$timeout', '$routeParams',
    'nbUtil', 'nbUser', 'nbInode', 'nbChat',
    function($scope, $q, $location, $timeout, $routeParams,
        nbUtil, nbUser, nbInode, nbChat) {

        var chat = nbChat.get_chat_by_id($routeParams.id);
        if (!chat) {
            open_chats();
        }

        $scope.chat = chat;
        $scope.send_chat_text = send_chat_text;
        $scope.select_files_to_chat = select_files_to_chat;
        $scope.upload_files_to_chat = upload_files_to_chat;

        $scope.open_chat_inode = open_chat_inode;
        $scope.open_chats = open_chats;
        scroll_chat_to_bottom();

        function open_chat_inode(inode) {
            $location.path('/files/' + inode.id);
        }

        function open_chats(inode) {
            $location.path('/chat/');
        }

        function scroll_chat_to_bottom() {
            $timeout(function() {
                var div = $('.chat-panel .panel-body');
                if (!div.length) {
                    return;
                }
                div[0].scrollTop = div[0].scrollHeight;
            }, 0);
        }

        function add_chat_message(msg) {
            chat.msgs.push(msg);
        }

        function send_chat_message(msg) {
            $scope.sending_message = true;
            return nbChat.send_chat_message(chat, msg).then(function() {
                scroll_chat_to_bottom();
            })['finally'](function() {
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
