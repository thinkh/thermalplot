#!/bin/sh
echo "--- Start provision.sh ---"

# echo "Run apt-get update" 
# apt-get update -y

echo "Install Python dependencies"
pip install -r /var/server/requirements.txt

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
	npm install -g bower grunt-cli tsd

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
		rm -rf "$clientdir/node_modules"
		rm -rf "/var/node_modules/$clientname/node_modules"

		echo "Create dir /var/node_modules/$clientname/node_modules"
		mkdir -p "/var/node_modules/$clientname/node_modules"
		chown vagrant:vagrant "/var/node_modules/$clientname/node_modules"

		echo "Link dir $clientdir/node_modules to /var/node_modules/$clientname/node_modules"
		ln -s "/var/node_modules/$clientname/node_modules" "$clientdir/node_modules"
		chown vagrant:vagrant "$clientdir/node_modules"

		echo "End Windows configuration"
	fi

	echo "Install npm dependencies"
	cd "$clientdir"

	npm install

	npm install graceful-fs delayed-stream # dependency from grunt-imagemin.js

	npm rebuild # sometimes node-sass and optipng-bin are not compiled properly

	bower install --allow-root

	echo "Create .provisioned file"
	echo $(date) > ".provisioned"

	echo "Build client app once"
	grunt build

	cd ".."

else
	echo "No client dir found!"
fi


echo "Update FTSE 250 dataset"
cd /var/server/data/thermal_ftse250/csv
pip install -r ./requirements.txt
python crawl.py --basedir=../sqlite/ --stock=ftse250.csv --start=2016-01-01 --end=2017-12-31


echo "Update S&P 500 dataset"
cd /var/server/data/thermal_sp500/csv
pip install -r ./requirements.txt
python crawl.py --basedir=../sqlite/ --stock=sp500.csv --start=2016-01-01 --end=2017-12-31


echo "--- Finished provision.sh ---"


if [ $2 != "nostart" ]
then

  echo "Start server"

  echo "-----------------------------"
  echo "ThermalPlot is ready!"
  echo "Only two steps left:"
  echo "1) Open web browser"
  echo "2) Navigate to http://localhost:8888"
  echo "-----------------------------"

  cd /var/server
  python main.py -config=env.vagrant_serve.conf
fi
