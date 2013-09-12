function HelpCtrl($scope, $http) {
	$scope.str2id = function(str) {
		return str.split(' ').join('');
	};

	$scope.client_faq = {
		title: 'NooBaa Client FAQ',
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
				'Preferably yes. We will monitor the unavailability periods of your device and will notify you',
				'if the time off the grid makes the device unusable to NooBaa.'
			].join('\n')
		}, {
			q: 'I\'ve downloaded and installed the application but can\'t find the sync folder.',
			a: [
				'NooBaa doesn\'t have a sync folder.',
				'Sync folders are great for very small amounts of data, but NooBaa is for BIG data.',
				'A sync folder which holds 2GB and is synced between your PC, you tablet and your mobile phone takes 6GB.',
				'This is OK for a small folder.',
				'When you want a cloud service for Terra-bytes, it\'s not efficient to sync everything, and better to consume directly from the cloud.',
			].join('\n')
		}]
	};

	$scope.login_faq = {
		title: 'Facebook Login FAQ',
		questions: [{
			q: 'Why do you require a Facebook login?',
			a: [
				'All you data on NooBaa is kept private, so we had to provide you with way to authenticate your identity. ',
				'As we can never remember our own passwords, and reusing passwords is a bad habit, ',
				'why would we force another nuisance on you?!',
			].join('\n')
		}, {
			q: 'Why don\'t you allow me to login with my email?',
			a: [
				'NooBaa is a social aware network, i.e. it allows you to quickly share with your Facebook friends who are also NooBaa users.',
				' With Facebook you don\'t need to create yet another contacts/friends list',
			].join('\n')
		}, {
			q: 'I don\'t have a Facebook user and would like to use NooBaa anyway.',
			a: [
				'We currently only support Facebook login so the easiest path would be to sign up to Facebook.',
				'We plan to allow a variety of other login accounts such as Google and Twitter but not very soon.',
			].join('\n')
		}, {
			q: 'Why only Facebook and why Facebook first?',
			a: [
				'The chances you already have a Facebook account are higher compared to all the rest.',
			].join('\n')
		}, {
			q: 'Must I Like your page on Facebook?',
			a: [
				'No. It would be beneficial to everybody as we\'re building a community and not a passive service. ',
				'Communicating with our customers would help us do the right thing.',
			].join('\n')
		}, {
			q: 'Why does Facebook ask me to approve your access?',
			a: [
				'This is done in order to keep your privacy. Every Facebook access shows a dialog with the access ',
				'reqeust the service provider, NooBaa, is making.',
				'As we would like to make it easy to share with your Facebook friends so it requires access to your Facebook list.',
				'We need your email to be able to communicate with you outside of NooBaa.',
				'We won\'t post on your wall or add you to any newsletter without getting your explicit permission first.'
			].join('\n')
		}, {
			q: 'Do you have access to my Facebook password or data?',
			a: [
				'No. NooBaa can\'t read your password nor can it post to your wall.',
			].join('\n')
		}],
	};

	$scope.general_faq = {
		title: 'General FAQ',
		questions: [{
			q: 'Nothing is ever really free. Where is the catch?',
			a: [
				'There is not catch. There is only co sharing. ',
				'The deal is simple: allocate some amount of local HD to be used by NooBaa,',
				'and get the same amount of cloud storage.',
				'Whether you need 100GB or 10TB, as long as you are co sharing the same capacity, it IS free.',
			].join('\n')
		}, {
			q: 'What do you mean by co sharing?',
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
			q: 'What makes you different from the rest of the cloud storage offerings out there?',
			a: [
				'No data centers - the crowd is the only real cloud. Free at any capacity. Fast thanks to the high number ',
				'of co-sharing users.'
			].join('\n')
		}, {
			q: 'I already use another cloud service. Why should I care?',
			a: [
				'By all means don\'t port data from one cloud service to another. That\'s a hassle.',
				'That said, with current offerings we\'re pretty sure you have a) a lot of material which ',
				'is still on local drives and not in any cloud service and b) that you have some underutilized hard ',
				' drives. Just allocate some data for co-sharing and stop adding $$$ to your monthly bill. '
			].join('\n')
		}, {
			q: 'What makes NooBaa simple?',
			a: [
				'Think you how you manage your data today. Photo\'s go there, movies in here, documents on cloud ',
				'A and scans on cloud B. You seldom have an efficient backup process, if any, and you\'re ',
				'managing it all manually. Now think of the following: One protected always accessible fast location. '
			].join('\n')
		}, {
			q: 'How do I avoid from being exposed to pirated/illegal content?',
			a: [
				'Your files are totally owned and controlled.',
				'People can only share with people on their social network, which guarantees knowledge  ',
				'of a shared file ownership.',
				'Your co-shared area doesn\'t contain  any content in it\'s original form, so you can\'t ',
				'access it even if you wanted to.'
			].join('\n')
		}, {
			q: 'If there is content on my co shared device, what limits me from reading it?',
			a: [
				'Encryption, chunking and distribution. Picture a book library.',
				'Now imagine that all the books were marked with a black marker (encryption), went through a shredding machine (chunking) and ended in a huge pile that is',
				'constantly stirred around. A small waste basket is filled with the shredded paper from the stirred pile and is placed in your office (distribution).',
				'Can you look at the content of the waste basket? Yes!',
				'Does it enable you to read a library book? No. '
			].join('\n')
		}, {
			q: 'Must my co shred device be connected to the Internet 24/7? Can\'t I use my laptop?',
			a: [
				'No. NooBaa will monitor your connectivity and will learn your sharing pattern.',
				'As long as you co share most of the time, you can enjoy the service for free.'
			].join('\n')
		}],
	};
	$scope.faq = [$scope.general_faq, $scope.login_faq, $scope.client_faq];
}
HelpCtrl.$inject = ['$scope', '$http'];