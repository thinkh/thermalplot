#!/bin/sh
echo "--- Start provision.sh ---"
 
# echo "Run apt-get update"
# sudo apt-get update -y

echo "Install Python dependencies"
sudo pip install -r /var/server/requirements.txt

# $1 is the first argument on running this script (must be true or false)
if $1
then
  echo "Windows detected -> special directory configuration!"

  echo "Create dir /var/node_modules"
  mkdir /var/node_modules
  chown vagrant:vagrant /var/node_modules

  echo "End Windows configuration"
fi

clientdir=/var/client/

if [ -d "$clientdir" ]
then
	echo "Install global npm dependencies"
	npm install -g bower grunt-cli tsd typescript

	if [ -f "$clientdir/.provisioned" ]
	then
		echo "Already provisioned -> skip client $clientdir"
		continue
	fi
	
	if [ -f "$clientdir/package.json" ]
	then
		echo "Found $clientdir/package.json -> Install node_modules"
	else
		echo "No package.json found -> skip client $clientdir"
		continue
	fi
	
	# get just the dirname and no path
	clientname="client"
	
	# $1 is the first argument on running this script (must be true or false)
	if $1
	then
		echo "Windows detected -> special directory for $clientdir configuration!"
		
		echo "Remove possible $clientdir/node_modules"
		sudo rm -rf "$clientdir/node_modules"
		sudo rm -rf "/var/node_modules/$clientname/node_modules"
		
		echo "Create dir /var/node_modules/$clientname/node_modules"
		sudo mkdir -p "/var/node_modules/$clientname/node_modules"
		sudo chown vagrant:vagrant "/var/node_modules/$clientname/node_modules"

		echo "Link dir $clientdir/node_modules to /var/node_modules/$clientname/node_modules"
		sudo ln -s "/var/node_modules/$clientname/node_modules" "$clientdir/node_modules"
		sudo chown vagrant:vagrant "$clientdir/node_modules"

		echo "End Windows configuration"
	fi
	
	echo "Install npm dependencies"
	cd "$clientdir"

	npm install

	npm install graceful-fs delayed-stream # dependency from grunt-imagemin.js

	bower install --allow-root
	
	echo "Create .provisioned file"
	echo $(date) > ".provisioned"

	echo "Build client app once"
	grunt build
	
	cd ".."
	
else
	echo "No client dir found!"
fi

echo "--- Finished provision.sh ---"
