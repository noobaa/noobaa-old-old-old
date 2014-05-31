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
            chats: [],
            chats_map: {},
            get_chat_by_id: get_chat_by_id,
            refresh_chats: refresh_chats,
            open_chat: open_chat,
            start_chat_with_friend: start_chat_with_friend,
        };


        function get_chat_by_id(id) {
            return $scope.chats_map[id];
        }

        function refresh_chats() {
            if ($scope.chats.length) {
                return;
            }
            $scope.chats.length = 0;
            for (var i = 0; i < 1; i++) {
                add_chat(sample_chat());
            }
        }

        function open_chat(chat) {
            open_chat_by_id(chat.id);
        }

        function open_chat_by_id(id) {
            $location.path('/chat/' + id);
        }

        function start_chat_with_friend(friend) {
            add_chat({
                id: friend.id,
                title: friend.name,
                user: friend,
                messages: []
            });
            open_chat_by_id(friend.id);
        }

        function add_chat(chat) {
            if ($scope.chats_map[chat.id]) {
                // TODO
            }
            $scope.chats.unshift(chat);
            $scope.chats_map[chat.id] = chat;
        }

        var yuval = {};
        var chat_id_gen = 1;

        function sample_chat() {
            return {
                id: chat_id_gen++,
                title: 'Yuval',
                messages: [{
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
        $scope.nbUser = nbUser;
        $scope.nbChat = nbChat;
        nbUser.init_friends();
        nbChat.refresh_chats();
    }
]);

nb_util.controller('ChatCtrl', [
    '$scope', '$q', '$location', '$timeout', '$routeParams',
    'nbUtil', 'nbUser', 'nbInode', 'nbChat',
    function($scope, $q, $location, $timeout, $routeParams,
        nbUtil, nbUser, nbInode, nbChat) {

        $scope.chat = nbChat.get_chat_by_id($routeParams.id);
        $scope.send_chat_text = send_chat_text;
        $scope.select_files_to_chat = select_files_to_chat;
        $scope.upload_files_to_chat = upload_files_to_chat;

        $scope.open_chat_inode = function(inode) {
            $location.path('/files/' + inode.id);
        };
        $scope.open_chats = function(inode) {
            $location.path('/chat/');
        };

        scroll_chat_to_bottom();


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
            $scope.chat.messages.push(msg);
            scroll_chat_to_bottom();
        }

        function send_chat_text() {
            if (!$scope.chat || !$scope.chat.message_input.length) {
                return;
            }
            add_chat_message({
                text: $scope.chat.message_input
            });
            $scope.chat.message_input = '';
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
                add_chat_message({
                    inode: choose_scope.context.current_inode
                });
            };
            choose_scope.title = 'Attach Files';
            modal = nbUtil.make_modal({
                template: 'chooser_modal.html',
                scope: choose_scope,
            });
        }

        function upload_files_to_chat() {}
    }
]);
