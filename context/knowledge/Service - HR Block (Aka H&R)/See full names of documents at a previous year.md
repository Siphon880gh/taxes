
Use Case: See what forms filled in a previous year to check if you're gathering receipts correctly for income/deductions/credits on this year (if similar financial situation)

Please Read: This only applies if you filed through H&R online (not through an in-person preparer). This is because you would have uploaded the documents.

See how these document names are all truncated, which can be very unhelpful, especially since you had uploaded many of these documents with your full name first in the filenames (as is convention to do so for sharing documents for a client case in an office environment):
![[Pasted image 20250414033800.png]]

There is no option to word wrap. However, if you open the DevTools in Chrome, you can run these custom scripts to modify the webpage to word wrap each document filename:

```
Array.from(document.querySelectorAll('.link-text')).forEach((el)=>{
    el.parentElement.style.whiteSpace = "wrap";
});
```


Now you see the full filenames!
![[Pasted image 20250414033855.png]]

H&R Block requires scrolling up and down. If you want a list of all the uploaded documents, unfortunately H&R Block does not offer that option. But DevTool scripts comes to the rescue - type this:
```
var a = [];
Array.from(document.querySelectorAll('.link-text')).forEach((el)=>{
    const innerText = el.innerText;
    if(innerText!=="No thanks, I'll do this later" && innerText!=="Privacy Notice" && innerText!=="H&R Block Privacy Notice")
        a.push(el.innerText);
});
a;
```

And that will list your files. For example (and you can copy and paste from the DevTools console):
![[Pasted image 20250414034005.png]]