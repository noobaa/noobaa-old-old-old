DATE=`date -u +"%Y-%m-%dT%H:%M:%SZ"`
OUTPUT="./noobaa-mongohq-dump-${DATE}"
PWD="P6b_jijck7ES7p8qUtpIfJfgU_m8Yt9PHWpsSmHhOBna0CJeUFx9oEVSTBfCfwpCD7e95q0LMIvhr-9wYXqPQw"

mongodump --host dharma.mongohq.com --port 10008 --db app16920415 --username heroku --password ${PWD} --out ${OUTPUT} 

