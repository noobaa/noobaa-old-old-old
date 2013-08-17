$(function() {
	var nb_tour = new Tour({
		debug: true,
		template: [
			'<div class="popover tour bglight" style="max-width: 600px">',
			'  <div class="arrow"></div>',
			'  <h1 class="popover-title fntread"></h1>',
			'  <div class="popover-content fnttour"></div>',
			'  <div class="popover-navigation modal-footer">',
			'    <button class="btn pull-left" data-role="end">Close</button>',
			'    <div class="btn-group">',
			'      <button class="btn" data-role="prev">« Prev</button>',
			'      <button class="btn btn-primary" data-role="next">Next »</button>',
			'    </div>',
			'  </div>',
			'</div>'
		].join('\n')
	});

	nb_tour.addSteps([{
		element: "#tour_link", // jQuery selector
		placement: 'bottom',
		backdrop: true,
		title: "WELCOME TO NOOBAA !",
		content: [
			'<p>Hi. I am your tour guide.<br></p>',
			'<p>To re-take the tour just press',
			' the <i class="icon-info-sign text-info"></i> button</p><p> on the top bar</p>',
			// '<p>* You can also navigate this tour using the left & right arrow keys</p>',
			// '<p>* This tour is always available using the',
			// '<i class="icon-info-sign text-info"></i> button at the top</p>'
		].join('\n')
	}, {
		element: "#my_data_link",
		placement: 'bottom',
		backdrop: true,
		title: "MY DATA",
		content: [
			'<p>This is where you manage your files.</p>'
		].join('\n')
	}, {
		element: "#my_dev_link",
		placement: 'bottom',
		backdrop: true,
		title: "MY DEVICES",
		content: [
			'<p>This is where you manage your devices.</p>'
		].join('\n')
	}, {
		element: "#dl",
		placement: 'bottom',
		backdrop: true,
		path: "/mydevices",
		title: "Install Device",
		content: [
			'<p>Start co-sharing by installing your first device.</p>',
			'<p>Download the software, unzip and run.</p>'
		].join('\n')
	}, {
		element: "#devs",
		placement: 'bottom',
		backdrop: true,
		path: "/mydevices",
		title: "Connecting the Device",
		content: [
			'<p>When the application starts you will see the dashboard screen.</p>',
			'<p>Connect it with your facebook account.</p>',
			'<p>Once the connection is made, you should see your device listed here.</p>'
		].join('\n')
	}, {
		element: "#my_data_link",
		placement: 'bottom',
		backdrop: true,
		reflex: true,
		path: "/mydevices",
		title: "First device added",
		content: [
			'<p>Once your device is up and running,',
			'you are co-sharing and enjoying the power of NooBaa\'s crowd-cloud!</p>',
			'<p>Lets go to MY DATA and meet your data...</p>'
		].join('\n')
	}, {
		element: "#my_data_link",
		placement: 'bottom',
		path: "/mydata",
		title: "MY DATA",
		content: [
			'<p>Let\'s see how to manage your data...</p>'
		].join('\n')
	},{
		element: "#inodes_tree",
		placement: 'right',
		path: "/mydata",
		title: "Accessing Data",
		content: [
			'<p>The two basic folder are "My Data" and "Shared with me".</p>',
			'<ui><li><strong>"My Data" </strong>holds all files that were uploaded by you.</li>',
			'<li><strong>"Shared with me"</strong> shows friends files that were shared with you.</li></ul>'
		].join('\n')
	},{
		element: "#main-btn-group",
		placement: 'bottom',
		path: "/mydata",
		title: "Uploading, Consuming, Sharing",
		content: [
			'<p>This is an area that is very useful when you access your data via tablet.</p>',
			'<p>Just mark the line in the files list, and activate the required action on it.</p>'
		].join('\n')
	}, {
		element: "#tour_link", // jQuery selector
		placement: 'bottom',
		backdrop: true,
		title: "WELCOME TO NOOBAA !",
		content: [
			'<p>This is where the tour ends.</p>',
			'<p>Remember you can re-take the tour by pressing',
			' the <i class="icon-info-sign text-info"></i> button</p><p> on the top bar.</p>',
			'<p>Press the <strong>Close</strong> button or go back to any step by pressing the <strong>Prev</strong> button.</p>',
			// '<p>* You can also navigate this tour using the left & right arrow keys</p>',
			// '<p>* This tour is always available using the',
			// '<i class="icon-info-sign text-info"></i> button at the top</p>'
		].join('\n')
	}]);

	$('#tour_link').click(function() {
		if (!nb_tour.ended()) {
			if (!confirm('End and restart the Tour?')) {
				return;
			}
		}
		// stop current tour
		nb_tour.end();
		// restart the tour from the beginning
		nb_tour.restart();
	});

	// when loading the page open the tour from last point
	// as saved in the local storage.
	nb_tour.start();
});