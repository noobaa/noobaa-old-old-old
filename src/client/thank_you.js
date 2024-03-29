'use strict';

var nb_thankyou = angular.module('nb_thankyou', ['nb_util']);

nb_thankyou.controller('ThankYouCtrl', [
    '$scope', '$http', '$window', '$location', 'nbUser',
    function($scope, $http, $window, $location, nbUser) {
        $scope.nbUser = nbUser;
        $scope.click_profile = function() {
            $window.location = '/testapp/';
        };
        $scope.submitting = false;
        $scope.submitted = false;
        $scope.new_email = nbUser.user.email;
        var err_msg_invalid_email = "We need your valid email to request an invite";
        var err_msg_server_error = "We are sorry but your request could not be processed right now, please try again later";

        var err_msg_known_email = "Thank you."; //when this is issued we don't hit the server
        var success_msg = "Your request was sent. Thanks!"; //this hits the server and should triger an email to the user

        $scope.submit = function() {
            $scope.submitting = true;
            $('.fa-circle-o-notch').show();
            $('.alert').html('').hide();

            if (!$scope.new_email) {
                return $scope.finished_with_error(err_msg_invalid_email);
            }
            if ($scope.new_email === nbUser.user.email) {
                return $scope.finished_with_success(err_msg_known_email);
            }

            var ajax = $http({
                method: 'PUT',
                url: '/api/user/',
                data: {
                    email: $scope.new_email
                }
            }).error(function(data, status, headers, config) {
                $scope.finished_with_error(err_msg_server_error);
            }).success(function(data, status, headers, config) {
                $scope.finished_with_success(success_msg);
            });
        };

        $scope.finished_with_error = function(text) {
            $scope.submitting = false;
            $('.fa-circle-o-notch').hide();
            $('.alert-success').html('').hide();
            $('.alert-error').html(text).show().effect('bounce', 'slow');
        };

        $scope.finished_with_success = function(text) {
            $scope.submitting = false;
            $scope.submitted = true;
            $('.fa-circle-o-notch').hide();
            $('.alert-error').html('').hide();
            $('.alert-success').html(text).show('fade', 'slow');
        };
    }
]);
