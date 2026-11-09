class BookingPage {
  constructor(page) {
    this.page = page;
    this.availableDate = page.locator('.calendar-day.available');
    this.confirmationHeading = page.getByRole('heading', {name: 'Your mat is reserved.'});
    this.partySize = page.locator('#partySize');
  }

  async open() { await this.page.goto('/book.html'); }

  async selectFirstFriday() {
    await this.page.getByRole('button', {name: /Friday/}).click();
    await this.availableDate.click();
  }

  async completeForm(student, {partySize = '1', paymentMethod = 'cash'} = {}) {
    await this.page.locator('#name').fill(student.name);
    await this.page.locator('#email').fill(student.email);
    await this.page.locator('#phone').fill(student.phone);
    await this.partySize.selectOption(partySize);
    await this.page.getByLabel(paymentMethod === 'duitnow_qr' ? 'DuitNow QR' : 'Cash').check();
  }

  async submit() { await this.page.getByRole('button', {name: 'Confirm booking'}).click(); }

  async bookFirstFriday(student, options) {
    await this.open();
    await this.selectFirstFriday();
    await this.completeForm(student, options);
    await this.submit();
  }

  async openConfirmedBooking() { await this.page.getByRole('link', {name: 'View booking'}).click(); }
}

module.exports = {BookingPage};
