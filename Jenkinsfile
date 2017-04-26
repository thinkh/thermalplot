node {
 stage('Checkout') {
   checkout scm
 }

 stage('Before Install') {
   def dockerHome = tool 'docker'
   env.PATH="${env.PATH}:${dockerHome}/bin"
 }

 stage('Install') {
   sh 'docker --version'
 }

 stage('Build') {
   try {
     withCredentials([usernameColonPassword(credentialsId: 'PHOVEA_GITHUB_CREDENTIALS', variable: 'PHOVEA_GITHUB_CREDENTIALS')]) {
       docker.withRegistry("https://922145058410.dkr.ecr.eu-central-1.amazonaws.com", "ecr:eu-central-1:PHOVEA_AWS_CREDENTIALS") {
         def newApp = docker.build "https://922145058410.dkr.ecr.eu-central-1.amazonaws.com/thermalplot:latest"
         newApp.push('latest')
      }
     }
     currentBuild.result = "SUCCESS"
   } catch (e) {
     // if any exception occurs, mark the build as failed
     currentBuild.result = 'FAILURE'
     throw e
   }
 }
}
