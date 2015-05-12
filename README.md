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
#ET

sudo mkdir -p /data/db
sudo mongod --smallfiles

#end ET
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
#Get updated env file from Guy and update the bucket prefix

# Installing Scons
download scones from http://downloads.sourceforge.net/project/scons/scons/2.3.4/scons-2.3.4.tar.gz?r=http%3A%2F%2Fwww.scons.org%2Fdownload.php&ts=1431437307&use_mirror=garr
``` 
tar -xzvf scons-2.3.4.tar.gz
cd scons-2.3.4
python setup.py install
```

# install makensis for installation build (MAC)
Make sure you have scons installed ([Installing Scons](# Installing Scons))
download nsis from here:
(for more information) follow http://blog.alejandrocelaya.com/2014/02/01/compile-nsis-scripts-in-linux/
```
curl -L "http://downloads.sourceforge.net/project/nsis/NSIS%203%20Pre-release/3.0b1/nsis-3.0b1-src.tar.bz2?r=http%3A%2F%2Fsourceforge.net%2Fprojects%2Fnsis%2Ffiles%2FNSIS%25203%2520Pre-release%2F3.0b1%2F&ts=1423381229&use_mirror=garr" > nsis-3.0b1-src.tar.bz2
curl -L "http://downloads.sourceforge.net/project/nsis/NSIS%203%20Pre-release/3.0b1/nsis-3.0b1.zip?r=http%3A%2F%2Fsourceforge.net%2Fprojects%2Fnsis%2Ffiles%2FNSIS%25203%2520Pre-release%2F3.0b1%2F&ts=1423381286&use_mirror=garr" >> nsis-3.0b1.zip
unzip nsis-3.0b1.zip
bzip2 -dk nsis-3.0b1-src.tar.bz2
tar -xvf nsis-3.0b1-src.tar
```
**BEFORE** you run the following command scons command, update SConstruct file under nsis-3.0b1-src folder with 
opts.Add(BoolVariable('STRIP_CP', 'Strips cross-platform executables of any unrequired data such as symbols', '**no**'))
```
cd nsis-3.0b1-src
scons SKIPSTUBS=all SKIPPLUGINS=all SKIPUTILS=all SKIPMISC=all NSIS_CONFIG_CONST_DATA=no PREFIX=<FULL_PATH>/nsis-3.0b1 install-compiler
chmod +x <FULL_PATH>/nsis-3.0b1/bin/makensis
ln -s <FULL_PATH>/nsis-3.0b1/bin/makensis /usr/local/bin/makensis
mkdir ./nsis-3.0b1/share
cd ./nsis-3.0b1/share
ln -s <FULL_PATH>/nsis-3.0b1 nsis
```

# download nsis plugin 

```
http://nsis.sourceforge.net/mediawiki/images/1/18/NsProcess.zip
```
1. unzip
2. copy <extracted folder>/Include/nsProcess.nsh to <nsis folder>/Include
3. copy <extracted folder>/Plugin/nsProcess.dll to <nsis folder>/Plugins/x86-ansi

#build under folder /noobaa/src/planet-app/prod
[TODO - Add to gulp script]

```
makensis noobaa.nsi
```

#Start it:
> foreman start
