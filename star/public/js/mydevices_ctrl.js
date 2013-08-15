// jquery init
$(function() {
	// $('#dl img').hover(function() {
	//	$(this).effect("shake", "slow");
	// });
});


MyDevicesCtrl.$inject = ['$scope', '$http', '$window', '$timeout'];

function MyDevicesCtrl($scope, $http, $window, $timeout) {

	$scope.devices = null;

	$scope.has_devices = function() {
		return !!$scope.devices && !!$scope.devices.length;
	};

	$scope.load_devices = function() {
		$http({
			method: 'GET',
			url: '/star_api/device/'
		}).success(function(data, status, headers, config) {
			console.log('[ok] got devices', data);
			$scope.devices = data;
			for (var i=0; i<data.length; i++) {
				data[i].last_update = new Date(data[i].last_update);
			}
		}).error(function(data, status, headers, config) {
			console.error('[ERR] get devices failed', data, status);
		});
	};

	$scope.load_devices();
}