/* jshint node:true */
'use strict';

var tray = null;

function App(window) {
	// load native ui library
	var gui = this.gui = window.require('nw.gui');
	var gui_win = this.gui_win = gui.Window.get();

	// make window hide on close
	gui_win.on('close', function() {
		this.hide();
	});

	// This will prevent iframe from redirecting parent location
	window.onbeforeunload = function() {
		return 'Why like this?';
	};

	var open = this.open = function() {
		gui_win.show();
		gui_win.restore();
		gui_win.focus();
		gui_win.requestAttention(true);
	};

	var quit = this.quit = function() {
		var q = 'Closing the application will stop the co-sharing. Are you sure?';
		if (window.confirm(q)) {
			gui_win.close(true);
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
				gui_win.showDevTools();
			}
		}));
		m.append(new gui.MenuItem({
			label: '(Reload)',
			click: function() {
				gui_win.reload();
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