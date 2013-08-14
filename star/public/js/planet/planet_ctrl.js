/* jshint node:true, browser:true, jquery:true, devel:true */
/* global angular:false */
// var _ = require('underscore');

// the planet angular controller

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

	// load native node-webkit library
	var gui = $scope.gui = window.require('nw.gui');

	$scope.reload_home = function() {
		if (window.location.href !== $scope.home_location) {
			window.console.log(window.location, $scope.home_location);
			window.location.href = $scope.home_location;
		} else {
			gui.Window.get().reload();
		}
	};

	$scope.hide_win = function() {
		gui.Window.get().hide();
	};

	// open this window
	$scope.open = function() {
		var w = gui.Window.get();
		w.show();
		w.restore();
		w.focus();
		w.requestAttention(true);
	};

	// terminate the entire application
	$scope.quit = function() {
		var q = 'Closing the application will stop the co-sharing. Are you sure?';
		if (window.confirm(q)) {
			gui.App.quit();
		}
	};

	// create global tray icon.
	// we create oncefor the entire application,
	// and store it in the main module (js/main.js)
	// so that even if more windows are created,
	// it will only have single tray.
	if (!global.tray) {
		global.tray = new gui.Tray({
			title: 'NooBaa',
			tooltip: 'Click to open NooBaa\'s Dashboard...',
			icon: 'noobaa_icon.ico',
			menu: new gui.Menu()
		});
		global.tray.on('click', $scope.open);

		// create tray menu
		var m = global.tray.menu;
		m.append(new gui.MenuItem({
			label: 'NooBaa\'s Dashboard',
			click: $scope.open
		}));
		m.append(new gui.MenuItem({
			label: 'Launch NooBaa Website',
			click: function() {
				gui.Shell.openExternal('http://www.noobaa.com');
			}
		}));
		m.append(new gui.MenuItem({
			type: 'separator'
		}));
		// TODO: show only for development
		m.append(new gui.MenuItem({
			label: '(Reload)',
			click: $scope.reload_home
		}));
		m.append(new gui.MenuItem({
			label: '(Show Dev Tools)',
			click: function() {
				gui.Window.get().showDevTools();
			}
		}));
		m.append(new gui.MenuItem({
			type: 'separator'
		}));
		m.append(new gui.MenuItem({
			label: 'Quit NooBaa',
			click: $scope.quit
		}));
	}

	// make window hide on close
	gui.Window.get().on('close', $scope.hide_win);
	// after all is inited, open the window
	$scope.open();



	////////////////////////////////////////////////////////////


	// init the planet authentication.
	// user login state
	$scope.planet_loading = true;
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
		window.frames.auth_frame.FB.login(function(res) {
			if (res.authResponse) {
				$scope.auth_frame_path('/auth/facebook/login/?state=/planet/auth');
			}
		});
	};

	// logout - mostly for testing
	$scope.do_disconnect = function() {
		var q = 'Disconnecting will stop the co-sharing. Are you sure?';
		if (window.confirm(q)) {
			$scope.auth_frame_path('/auth/logout/?state=/planet/auth');
		}
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

	$scope.reset_device = function() {
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
			data: get_host_info()
		}).success(function(data, status, headers, config) {
			console.log('[ok] create device', status);
			if (data.reload) {
				console.log('RELOAD REQUESTED');
				return $scope.reload_home();
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
				return $scope.reload_home();
			}
			schedule_device(5000);
		});
	}

	function update_device() {
		return $http({
			method: 'PUT',
			url: '/star_api/device/' + $scope.planet_device._id,
			data: get_host_info()
		}).success(function(data, status, headers, config) {
			console.log('[ok] update device', status);
			if (data.reload) {
				console.log('RELOAD REQUESTED');
				return $scope.reload_home();
			}
			schedule_device(60000);
		}).error(function(data, status, headers, config) {
			console.error('[ERR] update device', data, status);
			if (data.reload) {
				console.log('RELOAD REQUESTED');
				return $scope.reload_home();
			}
			schedule_device(60000);
		});
	}

	function get_host_info() {
		return {
			host_info: {
				hostname: os.hostname(),
				platform: os.platform()
			}
		};
	}

	periodic_device();
}

// avoid minification effects by injecting the required angularjs dependencies
PlanetCtrl.$inject = ['$scope', '$http', '$timeout'];