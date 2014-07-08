#NooBaa!!!


##Readme
This guide will help you to setup your mahcine to develop with NooBaa.
If you read this, it is YOUR role to take this code and make it into a script for the next person after you.
If you are the 3rd person reading this (based on commits) you have a team of assholes. 

This was ran on yuval's guest VM running kubuntu 14: 

`Linux yuvaldim-VirtualBox 3.13.0-30-generic #55-Ubuntu SMP Fri Jul 4 21:40:53 UTC 2014 x86_64 x86_64 x86_64 GNU/Linux`

###Assumption (should be modified when creating the script):
* working folder = ~/workspace
* git user name: "yuvaldim"
* git user email: "yuval.dimnik@gmail.com"
* DB name in mongo "nb"

##Install git
```
sudo apt-get install git
git config --global user.name "yuvaldim"
git config --global user.email "yuval.dimnik@gmail.com"
git config --list
```

##Install node
```
sudo apt-get update
sudo apt-get install nodejs
sudo apt-get install npm
#--The following is required for compatibility
#--- http://stackoverflow.com/questions/20057790/what-are-the-differences-between-node-js-and-node
sudo ln -s `which nodejs` /usr/local/bin/node
```

##Install heroku
```
sudo wget -qO- https://toolbelt.heroku.com/install-ubuntu.sh | sh
# requires login
> heroku login
```
[Heroku has a windows and mac clients so you should try them out here.] (https://help.github.com/articles/set-up-git)

##Additional packages
```
#install gulp globaly
sudo npm install gulp -g
#install the notifier for gulp:
sudo apt-get install libnotify-bin
sudo apt-get install notify-osd
```

#Install mongo (2.4)
We are using Mongo 2.4 so all info related to this version. 
```
#http://docs.mongodb.org/v2.4/tutorial/install-mongodb-on-ubuntu/
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 7F0CEB10
echo 'deb http://downloads-distro.mongodb.org/repo/ubuntu-upstart dist 10gen' | sudo tee /etc/apt/sources.list.d/mongodb.list
sudo apt-get update
sudo apt-get install mongodb-10gen=2.4.10
#the following prevernts from auto version upgrade
sudo echo "mongodb-10gen hold" | sudo dpkg --set-selections
```
To create the DB:
```
#---get into mongo:
# mongo
#---To create db nb
# use nb
#---insert some test data
# j = { name : "mongo" }
# db.testData.insert( j )
#---verify DB was created with 
# show dbs
db.addUser( { user: "admin", pwd: "admin", roles: [ "readWrite" ] } )
```
#Clone the project to your device
```
#--- create workspace folder under the user
mkdir ~/workspace
cd ~/workspace/
#clone the noobaa repository
git clone https://github.com/guymguym/noobaa.git
cd ~/workspace/noobaa
sudo npm install
```

#Start it:
> foreman start
