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
            chats: [], // all chats
            chat: null, // current chat
            refresh_chats: refresh_chats,
            open_chat: open_chat,
            send_chat_text: send_chat_text,
        };

        function refresh_chats() {
            var yuval = {};

            function sample_chat() {
                return {
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
            $scope.chats = [sample_chat(), sample_chat(), sample_chat(), sample_chat()];
        }


        function open_chat(chat) {
            $scope.chat = chat;
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

        function scroll_chat_to_bottom() {
            $timeout(function() {
                var div = $('.chat-messages');
                if (!div.length) {
                    return;
                }
                console.log('div', div[0].scrollTop, div[0].scrollHeight);
                div[0].scrollTop = div[0].scrollHeight;
            }, 0);
        }

        function add_chat_message(msg) {
            $scope.chat.messages.push(msg);
            scroll_chat_to_bottom();
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
            var hdr = $('<div class="modal-header">')
                .append($('<button type="button" class="close" data-dismiss="modal" aria-hidden="true">').html('&times;'))
                .append($('<h4>').text('Attach Files'));
            var body = $('<div class="modal-body" nb-chooser context="context">').css('padding', 0);
            var foot = $('<div class="modal-footer">').css('margin-top', 0)
                .append($('<button type="button" class="btn btn-default" data-dismiss="modal">').text('Close'))
                .append($('<button type="button" class="btn btn-primary" ng-click="run()" ng-disabled="run_disabled()">').text('OK'));
            modal = nbUtil.modal($('<div>').append(hdr, body, foot), choose_scope);
        }

        return $scope;
    }
]);

nb_util.controller('ChatCtrl', [
    '$scope', '$q', '$location', '$timeout', 'nbUtil', 'nbUser', 'nbInode', 'nbChat',
    function($scope, $q, $location, $timeout, nbUtil, nbUser, nbInode, nbChat) {
        $scope.select_files_to_chat = nbChat.select_files_to_chat;
        $scope.upload_files_to_chat = nbChat.upload_files_to_chat;
        $scope.open_chat_inode = function(inode) {
            $location.path('/items/' + inode.id);
        };
    }
]);
