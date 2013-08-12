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

	// TODO: change domain to noobaa.com
	$scope.star_url = 'http://127.0.0.1:5000';

	// keep original location as home location
	// to be able to restore to it if we redirect
	$scope.home_location = window.location.href;

	$scope.reload_home = function() {
		if (window.location.href !== $scope.home_location) {
			window.console.log(window.location, $scope.home_location);
			window.location.href = $scope.home_location;
		} else {
			gui.Window.get().reload();
		}
	};

	// load native ui library
	var gui = $scope.gui = window.require('nw.gui');

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

	// open a new window
	$scope.new_win = function(url) {
		url = url || $scope.star_url;
		return gui.Window.open(url, {
			toolbar: true,
			frame: true,
			icon: 'noobaa_icon.ico',
			width: 750,
			height: 550
		});
	};

	// terminate the entire application
	$scope.quit = function() {
		var q = 'Closing the application will stop the co-sharing. Are you sure?';
		if (window.confirm(q)) {
			gui.App.quit();
		}
	};

	// user login state
	$scope.planet_user = null;

	// update the connect frame src to load a new url
	// the frame is used to contain the facebook connect code
	// which cannot be used inside a 'file://' type url 
	// which is used by node-webkit.
	$scope.auth_frame_path = function(path) {
		$('#auth_frame')[0].src = $scope.star_url + path;
	};

	// pull info from the frame once it loads
	$('#auth_frame')[0].onload = function() {
		var f = window.frames.auth_frame;
		if (f.noobaa_user) {
			// when the user login returned info, pull it to our state
			console.log('USER:', f.noobaa_user);
			$scope.planet_user = f.noobaa_user;
			$scope.safe_apply();
		}
	};

	// on init load the auth login page into the frame.
	$scope.auth_frame_path('/auth');

	// submit connect request - will open facebool login dialog window.
	$scope.do_connect = function() {
		window.frames.auth_frame.FB.login(function(res) {
			if (res.authResponse) {
				$scope.auth_frame_path('/auth/facebook/login/?state=/auth');
			}
		});
	};

	// logout - mostly for testing
	$scope.do_disconnect = function() {
		var q = 'Disconnecting the device will stop the co-sharing. Are you sure?';
		if (window.confirm(q)) {
			$scope.planet_user = null;
			$scope.auth_frame_path('/auth/logout/?state=/auth');
		}
	};

	function do_get() {
		$http({
			method: 'GET',
			url: $scope.star_url + '/star_api/inode/null'
		}).success(function(data, status, headers, config) {
			console.log('[ok] readdir', status);
		}).error(function(data, status, headers, config) {
			console.error('[ERR] readdir', data, status);
		});
		$timeout(do_get, 60000);
	}
	$timeout(do_get, 10000);


	var planetfs = global;//require('./planetfs');

	$scope.planetfs = new planetfs.PlanetFS(
		gui.App.dataPath.toString(), // root_dir
		1, // num_chunks
		1024 * 1024); // chunk_size

	$scope.planetfs.init_chunks(function(err) {
		if (err) {
			console.log('PLANET FS INIT FAILED:', err.toString());
		} else {
			console.log('PLANET FS INIT DONE');
		}
	});

	// create tray icon.
	// we create oncefor the entire application,
	// and store it in the main module (js/main.js)
	// so that even if more windows are created,
	// it will only have single tray.
	if (!global.tray) {
		var tray = global.tray = new gui.Tray({
			title: 'NooBaa',
			tooltip: 'Click to open NooBaa\'s Dashboard...',
			icon: 'noobaa_icon.ico',
			menu: new gui.Menu()
		});
		tray.on('click', $scope.open);

		// create tray menu
		var m = tray.menu;
		m.append(new gui.MenuItem({
			label: 'NooBaa\'s Dashboard',
			click: $scope.open
		}));
		m.append(new gui.MenuItem({
			label: 'Launch NooBaa website',
			click: function() {
				gui.Shell.openExternal('https://www.noobaa.com');
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
			label: '(New Window)',
			click: $scope.new_win
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
}

// avoid minification effects by injecting the required angularjs dependencies
PlanetCtrl.$inject = ['$scope', '$http', '$timeout'];