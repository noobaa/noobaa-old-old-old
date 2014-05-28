'use strict';

var nb_util = angular.module('nb_util');

nb_util.controller('FeedbackCtrl', [
    '$scope', '$http', '$timeout', '$interval', '$q',
    '$rootScope', '$window', '$location', 'nbUtil', 'nbUser',
    function($scope, $http, $timeout, $interval, $q,
        $rootScope, $window, $location, nbUtil, nbUser) {

        // delay the access to $scope.modal to after initialization to prevent circular dep
        $timeout(function() {
            $scope.modal.on('show.bs.modal', function() {
                $scope.feedback_send_done = false;
                $scope.safe_apply();
            });
        }, 0);

        $scope.send_feedback = function() {
            // add to persistent local storage, and return immediately
            // the worker will send in background
            $scope.feedbacks.push($scope.feedback_text);
            localStorage.feedbacks = JSON.stringify($scope.feedbacks);
            $scope.feedback_send_done = true;
            $scope.feedback_text = '';
            $scope.feedback_worker();
        };

        $scope.feedback_worker = function() {
            if ($scope.feedback_promise) {
                return;
            }
            if (!$scope.feedbacks.length) {
                return;
            }
            console.log('sending feedback.', 'queue:', $scope.feedbacks.length);
            $scope.feedback_promise = $http({
                method: 'POST',
                url: '/api/user/feedback/',
                data: {
                    feedback: $scope.feedbacks[0]
                }
            }).then(function() {
                $scope.feedbacks.shift(); // remove sent element
                console.log('SENT FEEDBACK, REMAIN', $scope.feedbacks.length);
                localStorage.feedbacks = JSON.stringify($scope.feedbacks);
                $scope.feedback_promise = null;
                $timeout($scope.feedback_worker, 1000);
            }, function(err) {
                console.error('FAILED FEEDBACK (will retry)', err);
                $scope.feedback_promise = null;
                $timeout($scope.feedback_worker, 5000);
            });
        };

        $scope.feedbacks = localStorage.feedbacks ? JSON.parse(localStorage.feedbacks) : [];

        $scope.feedback_worker();

    }
]);


nb_util.factory('nbUserFeedback', [
    '$http', '$timeout', '$interval', '$q',
    '$rootScope', '$window', '$location', 'nbUtil',
    function($http, $timeout, $interval, $q,
        $rootScope, $window, $location, nbUtil) {

        var $scope = $rootScope.$new();

        $scope.modal = nbUtil.make_modal({
            template: 'user_feedback.html',
            scope: $scope,
            persist: true,
            show: false
        });

        $scope.show = function() {
            $scope.modal.modal('show');
        };

        return $scope;
    }
]);
