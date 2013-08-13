function MyDevicesCtrl($scope, $http, $window, $timeout) {

	$scope.devices = {};

	$scope.has_devices = function() {
		return !_.isEmpty($scope.devices);
	};

	/*
	$scope.client_platforms = {
		"Linux i686": "linux_386",
	};
	$scope.client_platform = $scope.client_platforms[navigator.platform];
	*/

}

// also specify dependencies explicitly to avoid minification effects:
MyDevicesCtrl.$inject = ['$scope', '$http', '$window', '$timeout'];