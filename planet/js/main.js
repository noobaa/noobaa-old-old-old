/* jshint node:true */
'use strict';

var tray = null;

function App(window) {
	// load native ui library
	var gui = this.gui = window.require('nw.gui');

	// make window hide on close
	gui.Window.get().on('close', function() {
		this.hide();
	});

	var open = this.open = function() {
		var w = gui.Window.get();
		w.show();
		w.restore();
		w.focus();
		w.requestAttention(true);
	};

	var new_win = this.new_win = function(url) {
		window.open(url, '_blank');
	};

	var quit = this.quit = function() {
		var q = 'Closing the application will stop the co-sharing. Are you sure?';
		if (window.confirm(q)) {
			gui.App.quit();
			//gui.Window.get().close(true);
		}
	};

	if (!tray) {
		// create tray icon
		tray = this.tray = new gui.Tray({
			title: 'NooBaa',
			tooltip: 'Click to open NooBaa\'s Dashboard...',
			icon: 'nblib/img/noobaa_icon.ico',
			menu: new gui.Menu()
		});
		tray.on('click', open);

		// create tray menu
		var m = tray.menu;
		m.append(new gui.MenuItem({
			label: 'NooBaa\'s Dashboard',
			click: open
		}));
		m.append(new gui.MenuItem({
			type: 'separator'
		}));
		// TODO: show only for development
		m.append(new gui.MenuItem({
			label: '(Show Dev Tools)',
			click: function() {
				gui.Window.get().showDevTools();
			}
		}));
		m.append(new gui.MenuItem({
			label: '(Reload)',
			click: function() {
				gui.Window.get().reload();
			}
		}));
		m.append(new gui.MenuItem({
			type: 'separator'
		}));
		m.append(new gui.MenuItem({
			label: 'Quit NooBaa',
			click: quit
		}));
	}
}

exports.App = App;