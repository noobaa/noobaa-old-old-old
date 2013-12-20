/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
/* jshint -W099 */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.factory('nbUser', [
		'$http', '$timeout', '$interval', '$q', '$rootScope',
		function($http, $timeout, $interval, $q, $rootScope) {

			var $scope = {};
			

			var server_data_raw = $('#server_data').html();
			$scope.server_data = server_data_raw ? JSON.parse(server_data_raw) : {};
			$scope.user = $scope.server_data.user;

			$scope.user_quota = -1;
			$scope.user_usage = -1;
			$scope.usage_percents = -1;

			$scope.update_user_info = update_user_info;
			$scope.user_pic_url = user_pic_url;

			function set_user_usage(quota, usage) {
				$scope.user_quota = quota;
				$scope.user_usage = usage;
				$scope.usage_percents = Math.ceil(100 * usage / quota);
			}

			function update_user_info() {
				reset_update_user_info(true);
				return $http({
					method: "GET",
					url: "/api/user/",
				}).then(function(res) {
					set_user_usage(res.data.quota, res.data.usage);
					reset_update_user_info();
					return res;
				}, function(err) {
					console.log('FAILED GET USER', err);
					reset_update_user_info();
					throw err;
				});
			}

			function reset_update_user_info(unset) {
				$timeout.cancel($scope.timeout_update_user_info);
				$scope.timeout_update_user_info = unset ? null : $timeout(update_user_info, 60000);
			}

			// testing code
			if (false) {
				var temp = 0;
				$interval(function() {
					if (temp > 100) {
						temp = 0;
					}
					set_user_usage(100, temp);
					temp += 10;
				}, 2000);
			}

			function user_pic_url(user) {
				if (!user) {
					return;
				}
				if (user.fbid) {
					return 'https://graph.facebook.com/' + user.fbid + '/picture';
				}
				if (user.googleid) {
					return 'https://plus.google.com/s2/photos/profile/' + user.googleid + '?sz=50';
				}
			}

			return $scope;

		}
	]);

})();
