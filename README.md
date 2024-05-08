# Flow Launcher Bitwarden Plugin
## Steps for logging in to Bitwarden

Go to the plugins page in flow, expand the Bitwarden tab and click on the folder icon (📁).   
Then right click inside the folder and click open in terminal and enter this command.
```
bw login 'email' 'password' --code 2FA
```
Make sure to use( `''` ) (yubico auth also works).
If you don't have 2FA you can remove the `--code` part.   
For logout just enter `bw logout`   
   
