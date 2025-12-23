// create_hash.js
const bcrypt = require('bcrypt');
const saltRounds = 10; // Standard for security

// The password you want to hash
const myPassword = '123123'; // Change this to your desired test password

bcrypt.hash(myPassword, saltRounds, function (err, hash) {
    if (err) {
        console.error('Error hashing password:', err);
    } else {
        console.log('Your Hashed Password is:');
        console.log(hash);
        console.log('\nGo to phpMyAdmin, edit your user, and paste this entire hash into the password_hash column.');
    }
});