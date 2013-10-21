/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');


	////////////////////////////////
	////////////////////////////////
	// MenuBarCtrl
	////////////////////////////////
	////////////////////////////////

	noobaa_app.controller('MenuBarCtrl', [
		'$scope', '$http', '$timeout', '$window', 'nbUserSrv',
		MenuBarCtrl
	]);

	function MenuBarCtrl($scope, $http, $timeout, $window, nbUserSrv) {
		$scope.active_link = function(link) {
			return link === $window.location.pathname ? 'active' : '';
		};
		$scope.click_feedback = function() {
			$('#feedback_dialog').scope().open();
		};

		$scope.providers = {};
		$scope.providers['fb'] = {
			provider_id: 'fbid',
			auth_path: '/auth/facebook/login/'
		};
		$scope.providers['google'] = {
			provider_id: 'googleid',
			auth_path: '/auth/google/login/'
		};

		$scope.get_provider_state_text = function(provider) {
			// var local_id = $scope.providers[provider].provider_id;
			// console.log('local_id: ',local_id);
			if (!nbUserSrv.get_user()[$scope.providers[provider].provider_id]) {
				//unknown provider state
				return 'Connect';
			}
			if (nbUserSrv.has_token(provider)) {
				return 'Connected';
			}
			return 'Re-connect';
		}

		$scope.provider_auth_link = function(provider) {
			console.log('in provider_auth_link. Provider:', provider);
			console.log('$scope.get_provider_state_text(provider): ', $scope.get_provider_state_text(provider));
			if ($scope.get_provider_state_text(provider) === 'Connected') {
				console.log('link to nothing...');
				return null;
			}
			console.log('link should link to: ', provider);
			return $scope.providers[provider].auth_path;
		}

	}

	////////////////////////////////
	////////////////////////////////
	// FeedbackCtrl
	////////////////////////////////
	////////////////////////////////

	noobaa_app.controller('FeedbackCtrl', [
		'$scope', '$http', '$timeout',
		FeedbackCtrl
	]);

	function FeedbackCtrl($scope, $http, $timeout) {

		var dlg = $('#feedback_dialog');
		dlg.nbdialog({
			modal: true,
			css: {
				width: 500
			}
		});

		$scope.open = function() {
			$scope.send_done = false;
			dlg.nbdialog('open');
		};

		$scope.send = function() {
			// add to persistent local storage, and return immediately
			// the worker will send in background
			$scope.feedbacks.push($scope.feedback);
			localStorage.feedbacks = JSON.stringify($scope.feedbacks);
			$scope.send_done = true;
			$scope.feedback = '';
			$scope.worker();
		};

		$scope.worker = function() {
			if ($scope.sending) {
				return;
			}
			if (!$scope.feedbacks.length) {
				return;
			}
			console.log('sending feedback.', 'queue:', $scope.feedbacks.length);
			$scope.sending = $http({
				method: 'POST',
				url: '/star_api/user/feedback/',
				data: {
					feedback: $scope.feedbacks[0]
				}
			}).success(function() {
				console.log('send feedback success.', 'queue:', $scope.feedbacks.length);
				$scope.feedbacks.shift(); // remove sent element
				localStorage.feedbacks = JSON.stringify($scope.feedbacks);
				$scope.sending = null;
				$timeout($scope.worker, 1000);
			}).error(function(data, status) {
				console.error('failed feedback.', 'status:', status, 'data:', data);
				$scope.sending = null;
				$timeout($scope.worker, 5000);
			});
		};

		$scope.feedbacks = localStorage.feedbacks ?
			JSON.parse(localStorage.feedbacks) : [];
		$scope.worker();
	}

	////////////////////////////////
	////////////////////////////////
	// UserCtrl
	////////////////////////////////
	////////////////////////////////

	noobaa_app.controller('UserCtrl', [
		'$scope', '$http', '$timeout',
		UserCtrl
	]);

	function UserCtrl($scope, $http, $timeout) {
		$scope.user_quota = 0;
		$scope.user_usage = 0;

		function cancel_usage_refresh() {
			$timeout.cancel($scope.usage_refresh_timeout);
			delete $scope.usage_refresh_timeout;
		}

		function usage_refresh() {
			cancel_usage_refresh();
			$http({
				method: "GET",
				url: "/star_api/user/",
			}).success(function(data, status, headers, config) {
				$scope.user_quota = data.quota;
				$scope.user_usage = data.usage;
				cancel_usage_refresh();
				$scope.usage_refresh_timeout =
					$timeout(usage_refresh, 60000);
			}).error(function(data, status, headers, config) {
				console.log("Error in querying user usage: ", status);
				cancel_usage_refresh();
				$scope.usage_refresh_timeout =
					$timeout(usage_refresh, 60000);
			});
		}
		usage_refresh();
	}

})();