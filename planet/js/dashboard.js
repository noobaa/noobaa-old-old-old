/* jshint node:true, browser:true, jquery:true, devel:true */
/* global angular:false */


// the dashboard angular controller

function DashboardCtrl($scope) {
	'use strict';

	console.log('DashboardCtrl');

	// TODO: change domain to noobaa.com
	$scope.star_url = 'http://127.0.0.1:5000';

	// keep original location as home location
	// to be able to restore to it if we redirect
	$scope.home_location = window.location.href;

	$scope.reload_home = function() {
		window.console.log(window.location, $scope.home_location);
		window.location.href = $scope.home_location;
		//gui.Window.get().reload();
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
			// save window state in localStorage
			// for next time.
			var w = gui.Window.get();
			localStorage.win_x = w.x;
			localStorage.win_y = w.y;
			localStorage.win_width = w.width;
			localStorage.win_height = w.height;
			gui.App.quit();
		}
	};

	// restore window state from locaoStorage
	if (localStorage.win_width && localStorage.win_height) {
		var w = gui.Window.get();
		w.resizeTo(
			parseInt(localStorage.win_width, 10),
			parseInt(localStorage.win_height, 10));
		w.moveTo(
			parseInt(localStorage.win_x, 10),
			parseInt(localStorage.win_y, 10));
	}


	// user login info
	$scope.connected_user = null;

	// update the connect frame src to load a new url
	// the frame is used to contain the facebook connect code
	// which cannot be used inside a 'file://' type url 
	// which is used by node-webkit.

	function connect_frame_path(path) {
		$('#connect_frame')[0].src = $scope.star_url + path;
	}

	// pull info from the frame once it loads
	$('#connect_frame')[0].onload = function() {
		var c = window.frames.connect_frame;
		$scope.connected_user = c.noobaa_info ? c.noobaa_info.user : null;
		$scope.safe_apply();
		console.log('LOAD:', c.document.URL, c.noobaa_info);
		c.FB.Event.subscribe('auth.statusChange', function(res) {
			$scope.connected_user = c.noobaa_info ? c.noobaa_info.user : null;
			$scope.safe_apply();
			console.log('AUTH:', c.document.URL, c.noobaa_info);
		});
	};

	// submit connect request - will open facebool login dialog window.
	$scope.do_connect = function() {
		window.frames.connect_frame.FB.login(function(res) {
			if (res.authResponse) {
				connect_frame_path('/auth/facebook/planet/');
			}
		});
	};

	// logout - not really needed here, just for testing
	$scope.do_disconnect = function() {
		connect_frame_path('/auth/logout/');
	};

	// on init load the planet login page into the frame.
	connect_frame_path('/planet.html');


	var planetfs = require('./planetfs');
	var fs = new planetfs.PlanetFS(gui.App.dataPath.toString(), 10, 1024 * 1024);
	fs.init_chunks(function(err) {
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
DashboardCtrl.$inject = ['$scope'];