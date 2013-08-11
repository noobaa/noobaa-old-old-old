function MyDevicesCtrl($scope, $http, $window, $timeout) {

	$scope.devices = {};

	$scope.has_devices = function() {
		return !_.isEmpty($scope.devices);
	};

	$scope.add_device = function() {
		console.log('add_device');
		$scope.devices['a'] = {
			name: 'aaaa aaaa',
			os: 'osssoosss',
			atime: '123123123'
		};
	};


	/*
	function plat_download_url(plat) {
		return "/packages/noobaa_planet_" + plat + ".zip";
	}

	$scope.plat_download_urls = {
		"linux_386": plat_download_url("linux_386"),
		"linux_amd64": plat_download_url("linux_amd64"),
		"windows_386": plat_download_url("windows_386"),
		"windows_amd64": plat_download_url("windows_amd64"),
		"darwin_386": plat_download_url("darwin_386"),
		"darwin_amd64": plat_download_url("darwin_amd64"),
	};

	$scope.client_platforms = {
		"Linux i686": "linux_386",
	};

	$scope.client_platform = $scope.client_platforms[navigator.platform];

	$scope.client_download_url = function() {
		// console.log($scope.client_platform)
		return $scope.plat_download_urls[$scope.client_platform];
	}

	$scope.connected = false;
	$scope.show_downloads = false;

	$scope.do_connect = function() {
		var ajax = $http.post("<?= it.planet_api ?>" + "login", {
			cookie: document.cookie
		});
		ajax.error(function(data, status, headers, config) {
			console.log('[ERR]', [status, data]);
			$timeout($scope.do_connect, 2000);
		});
		ajax.success(function(data, status, headers, config) {
			console.log('[ok]', [status, data]);
			$scope.connected = true;
		});
	};

	$timeout($scope.do_connect, 0);
	*/

}

// also specify dependencies explicitly to avoid minification effects:
MyDevicesCtrl.$inject = ['$scope', '$http', '$window', '$timeout'];