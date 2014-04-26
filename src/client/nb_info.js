/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
/* jshint -W099 */
(function() {
	'use strict';

	var nb_info = angular.module('nb_info', ['nb_util']);

	nb_info.controller('InfoCtrl', ['$scope', '$http', 'nbUtil',
		function($scope, $http, nbUtil) {

			nbUtil.track_event('info.load');

			$scope.str2id = function(str) {
				return str.split(' ').join('');
			};

			$scope.client_faq = {
				title: 'NooBaa Client',
				questions: [{
					q: 'Must I download and install the client to use NooBaa?',
					a: [
						'No. You can take NooBaa for a test drive without downloading the client. ',
					].join('\n')
				}, {
					q: 'Which operating systems do you support?',
					a: [
						'Access to the dashboard is done using a web browser so you can access your data from anywhere. ',
						'The NooBaa client is currently available for Mac, Windows and Linux.',
					].join('\n')
				}, {
					q: 'Which files do I need to share while co-sharing?',
					a: [
						'Co-sharing is sharing system resources. Not data.',
						'When you install the NooBaa client and allocate 10GB, the NooBaa client can create 10GB worth of files',
						'for it\'s own use. Your data is not stored there, nor can you read the content of what\'s stored there ',
						'as that data is encrypted. '
					].join('\n')
				}, {
					q: 'Must my device be connected at all times to the network?',
					a: [
						'No. We will monitor the unavailability periods of your device and will notify you',
						'if the time off the grid makes the device unusable to NooBaa.'
					].join('\n')
				}, {
					q: 'I\'ve downloaded and installed the application but can\'t find the sync folder.',
					a: [
						'NooBaa doesn\'t have a sync folder.',
						'Sync folders are great for small amounts of data such as documents, but NooBaa is for BIG data.',
						'A sync folder which holds 2GB and is synced between your PC, you tablet and your mobile phone takes 6GB.',
						'Now imagine that the sync folder is 2TB in size. Do you want it to take 6TB on your local devices?',
						'Just consume everything directly from the cloud.',
					].join('\n')
				}]
			};

			$scope.login_faq = {
				title: 'Login',
				questions: [{
					q: 'Why do you require a Facebook/Google login?',
					a: [
						'All your data on NooBaa is kept private, so we had to provide you with way to authenticate your identity. ',
						'As we can never remember our own passwords, and reusing passwords is a bad habit, ',
						'why would we force another nuisance on you?!',
					].join('\n')
				}, {
					q: 'Why don\'t you allow me to login with my email?',
					a: [
						'NooBaa is a social aware network, i.e. it allows you to quickly share with your social network friends who are also NooBaa users.',
						' Using an existing social network account frees you from the need to create yet another contacts/friends list.',
					].join('\n')
				}, {
					q: 'Why only Facebook and Google?',
					a: [
						'The chances you already have either of those accounts are higher compared to all the rest.',
					].join('\n')
				}, {
					q: 'Why does Facebook/Google ask me to approve your access?',
					a: [
						'This is done in order to keep your privacy. Every access with your account shows a dialog with the access ',
						'request the service provider, NooBaa, is making.',
						'As we would like to make it easy to share with your friends, it requires access to your friends list.',
						'We need your email to be able to communicate with you outside of NooBaa.',
						'We won\'t post on your wall/feed or add you to any newsletter without getting your explicit permission first.'
					].join('\n')
				}, {
					q: 'Do you have access to my Facebook/Google password or data?',
					a: [
						'No. NooBaa can\'t access your passwords, nor can it post to your wall on your behalf.',
					].join('\n')
				}],
			};

			$scope.general_faq = {
				title: 'General',
				questions: [{
					q: 'What makes you different from the rest of the cloud storage offerings out there?',
					a: [
						'No data centers - the crowd is the only real cloud. Free at any capacity. Fast thanks to the high number ',
						'of co-sharing users.'
					].join('\n')
				}, {
					q: 'Nothing is ever really free. Where is the catch?',
					a: [
						'There is not catch. There is only co-sharing. ',
						'The deal is simple: allocate some amount of local HD to be used by NooBaa,',
						'and get the same amount of cloud storage.',
						'Whether you need 100GB or 10TB, as long as you are co-sharing the same capacity, it IS free.',
					].join('\n')
				}, {
					q: 'What do you mean by co-sharing?',
					a: [
						'It\'s easiest to explain with an example: ',
						'Let\'s say you have a PC with 1TB hard drive, and you have 300GB worth of data on it.',
						'700GB is free and underutilized. You install NooBaa and co-share 100GB. This means that now ',
						'you\'ll have 300GB of data (untouched and unchanged), 600GB of free and underutilized capacity and 100GB',
						'of capacity taken by NooBaa. Only now you also have 100GB of cloud storage. For free.',
						'Need more cloud storage? Just allocate more capacity.',
						'In the same scenario, you can even allocate 500GB for co-sharing, and move all your data to the cloud',
					].join('\n')
				}, {
					q: 'If I give 100GB and get 100GB, what\'s in it for me?',
					a: [
						'One allocates 100GB on a local, non-redundant, inaccessible remotely, hardly sharable location and gets ',
						'a simple redundant solution to store extreme media files. Device stolen or breaks? Your data is in the cloud. ',
						'Want to share your wipe-out movie collection from the office? No problem. Share family pictures with family ',
						'without exposing them to the social networks.'
					].join('\n')
				}, {
					q: 'I\'m sensitive about my privacy as I store my family pictures on the cloud. Is NooBaa right for me?',
					a: [
						'As you have full control of your content and whom you share with, NooBaa is very sensitive about your privacy',
						'As data is encrypted, chunked and distributed, it\'s impossible to scan it at a single location.'
					].join('\n')
				}, {
					q: 'I already use another cloud service. Why should I care?',
					a: [
						'By all means don\'t port data from one cloud service to another. That\'s a hassle.',
						'That said, with current offerings we\'re pretty sure you have a) a lot of material which ',
						'is still on local drives and not in any cloud service, and b) that you have some underutilized hard ',
						' drives. Just allocate some data for co-sharing and stop adding $$$ to your monthly bill.'
					].join('\n')
				}, {
					q: 'What makes NooBaa simple?',
					a: [
						'Think how you manage your data today. Photos go there, movies in here, documents on cloud ',
						'A and scans on cloud B. You seldom have an efficient backup process, if any, and you\'re ',
						'managing it all manually. Now think of the following: One protected always accessible fast location. '
					].join('\n')
				}, {
					q: 'How do I avoid being exposed to pirated and illegal content?',
					a: [
						'You own and control all the files under your account.',
						'People can only share owned files with people on their social network. This guarantees knowledge  ',
						'of the shared file source.',
						'Co-shared area doesn\'t contain any content in its original form, so you can\'t ',
						'access it even if you wanted to.',
						'Therefore, as long a you stick to the right side of the law, you\'re safe'
					].join('\n')
				}, {
					q: 'What limits me from reading the content on my co-shared device?',
					a: [
						'Encryption, chunking and distribution. Picture a book library.',
						'Now imagine that all the books were marked with a black marker (encryption), went through a shredding machine (chunking) and ended in a huge pile that is',
						'constantly stirred around. A small waste basket is filled with the shredded paper from the stirred pile and is placed in your office (distribution).',
						'Can you look at the content of the waste basket? Yes!',
						'Does it enable you to read a library book? No. '
					].join('\n')
				}, {
					q: 'Must my co-shared device be connected to the Internet 24/7? Can\'t I use my laptop?',
					a: [
						'No. NooBaa will monitor your connectivity and will learn your sharing pattern.',
						'As long as you co-share most of the time, you can enjoy the service for free.'
					].join('\n')
				}],
			};
			$scope.faq = [$scope.general_faq, $scope.login_faq, $scope.client_faq];
		}
	]);

})();
