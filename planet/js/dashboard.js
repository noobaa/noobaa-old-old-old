/* jshint node:true, browser:true, jquery:true, devel:true */
/* global angular:false */
var _ = require('underscore');

// the dashboard angular controller

function DashboardCtrl($scope, $http, $timeout) {
	'use strict';

	// keep local refs here so that any callback functions
	// defined here will resolve to the window.* members
	// and avoid failures when console is null on fast refresh.
	var console = window.console;
	var localStorage = window.localStorage;
	console.log('DashboardCtrl');

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

	// make window hide on close
	gui.Window.get().on('close', function() {
		this.hide();
	});

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
			icon: "nblib/img/noobaa_icon.ico",
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


	/* TODO: REMOVE COOKIE SHIT
	function random_str(len) {
		var text = "";
		var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for (var i = 0; i < len; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
	*/

	// load persistent login info
	/* TODO: REMOVE COOKIE SHIT
	$scope.planet_cookie = localStorage.planet_cookie;
	$scope.planet_user = localStorage.planet_user ?
		JSON.parse(localStorage.planet_user) : null;
	*/

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
		/* TODO: REMOVE COOKIE SHIT
			$scope.planet_cookie = f.document.cookie;
			localStorage.planet_user = JSON.stringify(f.noobaa_user);
			localStorage.planet_cookie = f.document.cookie;
		} else if ($scope.planet_cookie) {
			// when no user, load the existing cookies into the auth frame
			var c = $scope.planet_cookie.split('; ');
			for (var i = 0; i < c.length; i++) {
				// setting a cookie is the weirdest api:
				f.document.cookie = c[i];
			}
			console.log('LOAD COOKIES:', f.document.cookie);
		*/
		}
		$scope.safe_apply();
	};

	// on init load the auth login page into the frame.
	$scope.auth_frame_path('/auth.html');

	// submit connect request - will open facebool login dialog window.
	$scope.do_connect = function() {
		window.frames.auth_frame.FB.login(function(res) {
			if (res.authResponse) {
				$scope.auth_frame_path('/auth/facebook/login/?state=auth.html');
			}
		});
	};

	// logout - mostly for testing
	$scope.do_disconnect = function() {
		/* TODO: REMOVE COOKIE SHIT
		if ($scope.planet_cookie) {
			var f = window.frames.auth_frame;
			var c = $scope.planet_cookie.split('; ');
			for (var i = 0; i < c.length; i++) {
				// unsetting a cookie is the weirdest api:
				f.document.cookie = c[i].split('=')[0] +
					'=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
			}
			console.log('REMOVED COOKIES:', f.document.cookie);
		}
		delete localStorage.planet_cookie;
		delete localStorage.planet_user;
		$scope.planet_cookie = '';
		*/
		$scope.planet_user = null;
		$scope.auth_frame_path('/auth/logout/?state=auth.html');
	};

	function do_get() {
		$http({
			method: 'GET',
			url: $scope.star_url + '/star_api/inode/null'
		}).success(function(data, status, headers, config) {
			console.log('[ok]', status);
		}).error(function(data, status, headers, config) {
			console.error('[ERR]', data, status);
		});
		$timeout(do_get, 10000);
	}
	$timeout(do_get, 10000);


	var planetfs = require('./planetfs');

	$scope.planetfs = new planetfs.PlanetFS(
		gui.App.dataPath.toString(), // root_dir
		0, // num_chunks
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
	if (!process.mainModule.exports.tray) {
		var tray = process.mainModule.exports.tray = new gui.Tray({
			title: 'NooBaa',
			tooltip: 'Click to open NooBaa\'s Dashboard...',
			icon: 'nblib/img/noobaa_icon.ico',
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

	// after all is inited, open the window
	$scope.open();
}

// avoid minification effects by injecting the required angularjs dependencies
DashboardCtrl.$inject = ['$scope', '$http', '$timeout'];