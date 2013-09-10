/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
// TODO: how do we fix this warning? - "Use the function form of "use strict". (W097)"
/* jshint -W097 */
'use strict';


ThankYouCtrl.$inject = ['$scope', '$http'];

function ThankYouCtrl($scope, $http) {
	$scope.submitting = false;
	$scope.submitted = false;
	$scope.new_email = noobaa_user.email;
	var err_msg_invalid_email = "We need your valid email to request an invite";
	var err_msg_server_error = "We are sorry but your request could not be processed right now, please try again later";

	var err_msg_known_email = "Thank you."; //when this is issued we don't hit the server
	var success_msg = "Your request was sent. Thanks!"; //this hits the server and should triger an email to the user

	$scope.submit = function() {
		$scope.submitting = true;
		$('.icon-spinner').show();
		$('.alert').html('').hide();

		if (!$scope.new_email) {
			return $scope.finished_with_error(err_msg_invalid_email);
		}
		if ($scope.new_email == noobaa_user.email) {
			return $scope.finished_with_success(err_msg_known_email);
		}

		var ajax = $http({
			method: 'PUT',
			url: '/star_api/user/',
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
		$('.icon-spinner').hide();
		$('.alert-success').html('').hide();
		$('.alert-error').html(text).show().effect('bounce', 'slow');
	};

	$scope.finished_with_success = function(text) {
		$scope.submitting = false;
		$scope.submitted = true;
		$('.icon-spinner').hide();
		$('.alert-error').html('').hide();
		$('.alert-success').html(text).show('fade', 'slow');
	};
}