/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.controller('SettingsCtrl', [
		'$scope', '$http', '$window', '$timeout',
		SettingsCtrl
	]);

	function SettingsCtrl($scope, $http, $window, $timeout) {

		$scope.devices = null;

		$scope.has_devices = function() {
			return !!$scope.devices && !! $scope.devices.length;
		};

		$scope.load_devices = function() {
			$http({
				method: 'GET',
				url: '/star_api/device/'
			}).success(function(data, status, headers, config) {
				console.log('[ok] got devices', data);
				$scope.devices = data;
				for (var i = 0; i < data.length; i++) {
					if (data[i].last_update) {
						var d = new Date(data[i].last_update);
						data[i].last_update_str = d.toLocaleString();
					} else {
						data[i].last_update_str = '';
					}
				}
			}).error(function(data, status, headers, config) {
				console.error('[ERR] get devices failed', data, status);
			});
		};

		$scope.load_devices();
	}
})();