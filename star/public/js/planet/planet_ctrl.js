/* jshint node:true, browser:true, jquery:true, devel:true */
/* global angular:false */

// the planet angular controller

PlanetCtrl.$inject = ['$scope', '$http', '$timeout'];

function PlanetCtrl($scope, $http, $timeout) {
	'use strict';

	// keep local refs here so that any callback functions
	// defined here will resolve to the window.* members
	// and avoid failures when console is null on fast refresh.
	var console = window.console;
	var localStorage = window.localStorage;
	console.log('PlanetCtrl');

	// keep original location as home location
	// to be able to restore to it if we redirect
	$scope.home_location = window.location.href;

	var os = require('os');
	var path = require('path');

	// load native node-webkit library
	var gui = window.require('nw.gui');
	var win = gui.Window.get();
	win.$scope = $scope;

	$scope.close_win = function() {
		win.close(true);
	};

	$scope.is_fullscreen = false;
	$scope.toggle_fullscreen = function() {
		$scope.is_fullscreen = gui.Window.get().isFullscreen = !$scope.is_fullscreen;
		$('#sketch').css('height', ($scope.is_fullscreen ? '400px' : '0'));
	};

	$scope.hide_win = function() {
		if ($scope.is_fullscreen) {
			$scope.toggle_fullscreen();
		}
		win.hide();
	};

	// show this window
	$scope.show = function() {
		win.show();
		win.restore();
		win.focus();
		// win.requestAttention(true);
	};

	$scope.open_noobaa = function(path) {
		// using the same host and protocol as the local window
		// to support also testing env.
		var url = window.location.protocol + '//' +
			window.location.host + (path || '/');
		gui.Shell.openExternal(url);
	};

	$scope.open_settings = function() {
		$scope.open_noobaa('/settings');
	};

	$scope.open_help = function() {
		$scope.open_noobaa('/help');
	};

	$scope.nbconfirm = function(q, callback) {
		$scope.show();
		$.nbconfirm(q, {
			css: {
				width: win.width,
				height: win.height,
				top: 0,
				left: 0
			}
		}, callback);
	};

	// terminate the entire application
	$scope.quit_app = function() {
		var q = 'Closing the application will stop co-sharing, ' +
			'which will affect your account quota and performance.<br/>' +
			'Click "No" to keep co-sharing:';
		$scope.nbconfirm(q, function() {
			gui.App.quit();
		});
	};

	// make window hide on close
	win.on('close', $scope.hide_win);

	// on load show the window.
	// TODO: this might be too annoying, maybe only when the user requested...
	$scope.show();

	// pass "secret" argument to open dev tools
	if (gui.App.argv.length && gui.App.argv[0] === '--noobaadev') {
		win.showDevTools();
	}



	////////////////////////////////////////////////////////////


	// init the planet authentication.
	// user login state
	$scope.planet_loading = false;
	$scope.planet_user = null;

	// update the connect frame src to load a new url
	// the frame is used to contain the facebook connect code
	// which cannot be used inside a 'file://' type url 
	// which is used by node-webkit.
	$scope.auth_frame_path = function(path) {
		$('#auth_frame')[0].src = path;
		$scope.planet_loading = true;
		$scope.safe_apply();
	};

	// pull info from the frame once it loads
	$('#auth_frame')[0].onload = function() {
		var f = window.frames.auth_frame;
		// when the user login returned info, pull it to our state
		console.log('USER:', f.noobaa_user);
		$scope.planet_loading = false;
		$scope.planet_user = f.noobaa_user;
		$scope.safe_apply();
	};

	// submit connect request - will open facebool login dialog window.
	$scope.do_connect = function() {
		if (!window.frames.auth_frame.FB) {
			$scope.auth_frame_path('/auth/logout/?state=/planet/auth');
			return;
		}
		window.frames.auth_frame.FB.login(function(res) {
			if (res.authResponse) {
				$scope.auth_frame_path('/auth/facebook/login/?state=/planet/auth');
			}
		});
	};

	// logout - mostly for testing
	$scope.do_logout = function() {
		var q = 'Logging out will stop co-sharing, ' +
			'which will affect your account quota and performance.<br/>' +
			'Click "No" to keep co-sharing:';
		$scope.nbconfirm(q, function() {
			$scope.auth_frame_path('/auth/logout/?state=/planet/auth');
		});
	};

	// on init load the auth login page into the frame.
	$scope.auth_frame_path('/planet/auth');


	////////////////////////////////////////////////////////////


	// init the planet fs
	// this will create chunk files in the app directory
	// and make them available for co-sharing.
	$scope.planetfs = new global.PlanetFS(
		gui.App.dataPath.toString(), // root_dir
		1, // num_chunks
		1024 * 1024 // chunk_size
	);
	$scope.planetfs.init_chunks(function(err) {
		if (err) {
			console.log('PLANET FS INIT FAILED:', err.toString());
		} else {
			console.log('PLANET FS INIT DONE');
		}
	});


	////////////////////////////////////////////////////////////


	if (localStorage.planet_device) {
		$scope.planet_device = JSON.parse(localStorage.planet_device);
	}

	$scope.reconnect_device = function() {
		delete $scope.planet_device;
		delete localStorage.planet_device;
		schedule_device(1000);
	};

	function schedule_device(time) {
		$timeout.cancel($scope.device_promise);
		$scope.device_promise = $timeout(periodic_device, time);
	}

	function periodic_device() {
		if (!$scope.planet_user) {
			// no user connected, reschedule to check later
			schedule_device(5000);
		} else if (!$scope.planet_device) {
			// no device id - ask to create
			create_device();
		} else {
			update_device();
		}
	}

	function create_device() {
		return $http({
			method: 'POST',
			url: '/star_api/device/',
			data: {
				host_info: get_host_info()
			}
		}).success(function(data, status, headers, config) {
			console.log('[ok] create device', status);
			if (data.reload) {
				console.log('RELOAD REQUESTED');
				return $scope.close_win();
			}
			if (data.device) {
				$scope.planet_device = data.device;
				localStorage.planet_device = JSON.stringify(data.device);
			}
			schedule_device(5000);
		}).error(function(data, status, headers, config) {
			console.error('[ERR] create device', data, status);
			if (data.reload) {
				console.log('RELOAD REQUESTED');
				return $scope.close_win();
			}
			schedule_device(5000);
		});
	}

	function update_device(coshare_space) {
		return $http({
			method: 'PUT',
			url: '/star_api/device/' + $scope.planet_device._id,
			data: {
				host_info: get_host_info(),
				coshare_space: coshare_space
			}
		}).success(function(data, status, headers, config) {
			console.log('[ok] update device', status);
			if (data.reload) {
				console.log('RELOAD REQUESTED');
				return $scope.close_win();
			}
			if (coshare_space && data.device) {
				$scope.planet_device = data.device;
				localStorage.planet_device = JSON.stringify(data.device);
			}
			schedule_device(60000);
		}).error(function(data, status, headers, config) {
			console.error('[ERR] update device', data, status);
			delete $scope.planet_device;
			delete localStorage.planet_device;
			if (data.reload) {
				console.log('RELOAD REQUESTED');
				return $scope.close_win();
			}
			schedule_device(1000);
		});
	}

	function get_host_info() {
		return {
			hostname: os.hostname(),
			platform: os.platform()
		};
	}

	periodic_device();

	var GB = 1024 * 1024 * 1024;
	$scope.coshare_options = [{
		space: GB,
		title: 'Free 1 GB',
		// details: ''
	}, {
		space: 10 * GB,
		title: 'Free 10 GB',
		// details: '+ Performance Boost'
	}, {
		space: 100 * GB,
		title: 'Free 100 GB',
		// details: '+ Ultimate Performance'
	}];

	$scope.chosen_coshare_option = -1;

	$scope.coshare_options_select = function(index) {
		$scope.chosen_coshare_option = index;
		var opt = $scope.coshare_options[index];
		update_device(opt.space);
	}
	$scope.coshare_options_class = function(index) {
		return index === $scope.chosen_coshare_option ? 'active' : '';
	};

	$scope.coshare_view = function(val) {
		$scope.coshare_view_on = val;
	};

	$scope.current_view = function() {
		if ($scope.planet_loading) {
			return 'loading_view';
		}
		if (!$scope.planet_user) {
			return 'login_view';
		}
		if ($scope.coshare_view_on) {
			return 'coshare_view';
		}
		return 'info_view';
	};

}