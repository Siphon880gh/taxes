## Annual Interest Rate

When the IRS says an interest rate (like **7% annually, compounded daily**) applies to an **underpayment penalty**, they’re using **compound interest math**. This interest rate changes quarter to quarter

Where to find your interest rate? Visit quarterly interest rate page (https://www.irs.gov/payments/quarterly-interest-rates) and expand your year and find the category "Underpayment"
![[Pasted image 20250416212214.png]]


---

### **The Formula**

The general compound interest formula is:

$$A = P(1 + r/n)^{nt}$$
Where:
- A = final amount
- P = principal (the amount you owe)
- r = annual interest rate (as a decimal, so 7% = 0.07)
- n = number of times interest is compounded per year (daily = 365)
- t = time in years could be <1 or >=1 years. If <1, it's in months and days of the year.
### **What’s Happening in Plain English**

If you underpay taxes, the IRS **charges interest daily**, meaning they calculate a **tiny amount of interest every day**, and that interest gets added to your balance. The next day, they calculate interest **on that new balance**, and so on.

### **Mnemonic**

`A = P(1+(r/n))^(nt)`

You know that the principle (aka balanced) getting increased 7% is P x 1.07. However, when the IRS states **"7% annually, compounded daily"**, it's an interest rate being applied and accrued on the principle daily. So you do not simply multiply the principle at the end of the year by 1.07. This means that the annual rate is split daily so it's P(1+(r/n)), and that (1+(r/n)) is multiplied daily for as many dates as you're late on the payment. So the exponent ^(nt) is the math operator that multiplies that many days you're late on the payment. With n x t, that's 365 times the portion of year that you're late. If you're late for half a year, the exponential would be 182.5 in the exponential, like: A = 6000 (1+(0.07/365)) ^ 182.5 OR $$A=6000 (1.000191780821918) ^ {182.5}$$

### **Quick Example**

Let’s say you underpaid **$1,000** and left it unpaid for **90 days** (about 0.2466 years). At a **7% interest rate**, compounded daily:

$$A=1000(1+0.07365)^{365×0.2466}$$
$$A≈1000×(1.00019178)^{90}≈1000×1.01737≈1017.37$$
So you’d owe **about $17.37** in interest after 90 days.

## Calculators

### Online Dedicated Calculators
As of 4/2025, there are many common IRS calculators but there is no underpayment calculator unfortunately.

### Mac Calculators
You perform exponential calculations with this button
![[Pasted image 20250416215443.png]]

However Mac calculator even in scientific mode can't handle such precise calculations. You'll get error "Not a calculator":
![[Pasted image 20250416215528.png]]

## Online non-dedicated calculators

Google has a great in-built calculator that can handle this precision.

You can google search `1000 * (1 + 0.07/365) ^ 90`:

![[Pasted image 20250416215656.png]]


###  Note
- The IRS **changes this rate quarterly**.
- This is **just the interest**, not including potential **flat penalty fees**.
- If you're late with **estimated quarterly payments**, this is the kind of interest you might face.
