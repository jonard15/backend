/*
    dependencies
*/

const express = require('express')
const busboy = require('busboy');
let path = require('path')
let os = require('os')
let fs = require('fs')
let UUID = require('uuid-v4')
let webpush = require('web-push')
const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');


/*
    config-express
*/
    const app = express()

/*
    config-firebase
*/

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount),
  storageBucket: 'jonardgram.appspot.com'
});

const db = getFirestore();
const bucket = getStorage().bucket();

/*
  config - webpush
*/

webpush.setVapidDetails(
  'mailto:sienajonard15@gmail.com',
  'BHDcuzCUEI3FPL4-_HcG2XOWep44tGFS8ymJR5OSQO18z2CLny1L5YyIzzii7wpYYG4P1TXJdJ8KTuM2H4Seipk', // public key
  'Hk5ymMkydfXfsNVjAxAWZmQn0f1Dy58-9reWgxjWXuk' // private key
);

/*
    endpoint - posts
*/



app.get('/posts', (request, response) => {
    response.set('Access-Control-Allow-Origin', '*')

    let posts = []
     db.collection('posts').orderBy('date', 'desc').get().then(snapshot => {
        snapshot.forEach((doc) => {
            posts.push(doc.data())
     });
     response.send(posts)
})

})

/*
    endpoint - createPost
*/



app.post('/createPost', (request, response) => {
    response.set('Access-Control-Allow-Origin', '*')
    
    let uuid = UUID()

    const bb = busboy({ headers: request.headers });

    let fields = {}
    let fileData = {}

    bb.on('file', (name, file, info) => {
      const { filename, encoding, mimeType } = info;
      console.log(
        `File [${name}]: filename: %j, encoding: %j, mimeType: %j`,
        filename,
        encoding,
        mimeType
      );
      // /temp/test.png
      let filepath = path.join(os.tmpdir(), filename)
      file.pipe(fs.createWriteStream(filepath))
      fileData = { filepath, mimeType }
    });

    bb.on('field', (name, val, info) => {
      fields[name] = val
    });

    bb.on('close', () => {

        bucket.upload(
            fileData.filepath,
            {
                uploadType: 'media',
                metadata:{
                    metadata:{
                        contentType:fileData.mimeType,
                        firebaseStorageDownloadTokens: uuid
                    }
                }
            },
            (err, uploadedFile) => {
              if(!err) {
                createDocument(uploadedFile)
              }  
            }
        )
        function createDocument(uploadedFile) {
            db.collection('posts').doc(fields.id).set({
                id: fields.id,
                caption: fields.caption,
                location: fields.location,
                date: parseInt(fields.date),
                imageUrl: `https://firebasestorage.googleapis.com/v0/b/${ bucket.name}/o/${ uploadedFile.name }?alt=media&token=${ uuid }`
              }).then(() => {
                sendPushNotification()
                response.send('Post added: ' + fields.id)
              })
        }
        function sendPushNotification() {
          let subscriptions = []
          db.collection('subscriptions').get().then(snapshot => {
            snapshot.forEach((doc) => {
              subscriptions.push(doc.data())
            });
            return subscriptions
          }).then(subscriptions => {
            subscriptions.forEach(subscription => {
              if(subscription.endpoint.startsWith('https://fcm.googleapis.com')){
                const pushSubscription = {
                  endpoint: subscription.endpoint,
                  keys: {
                    auth: subscription.keys.auth,
                    p256dh: subscription.keys.p256dh
                  }
                };
                let pushContent = {
                  title: 'New Jonardgram Post!',
                  body: 'New Post Added! Check it out!',
                  openUrl: '/#/'
                }
                let pushContentStringified = JSON.stringify(pushContent)
                webpush.sendNotification(pushSubscription, pushContentStringified)
              }

            })
          })
        }
    });
    request.pipe(bb)
})

/*
  endpoint - createSubscription
*/

app.post('/createSubscription', (request, response) => {
  response.set('Access-Control-Allow-Origin', '*')
  db.collection('subscriptions').add(request.query).then(docRef => {
    response.send({
      message: 'Subscription added!',
      postData: request.query
    })
  })
})

/*
    listen
*/

app.listen(process.env.PORT || 3000)