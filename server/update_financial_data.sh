cd /var/server/data/thermal_ftse250/csv
pip install -r ./requirements.txt
sh update_sqlite.sh

cd /var/server/data/thermal_sp500/csv
pip install -r ./requirements.txt
sh update_sqlite.sh
