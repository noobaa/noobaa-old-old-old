// jquery init
$(function() {
	// $('#dl img').hover(function() {
	//	$(this).effect("shake", "slow");
	// });
});


SettingsCtrl.$inject = ['$scope', '$http', '$window', '$timeout'];

function SettingsCtrl($scope, $http, $window, $timeout) {

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