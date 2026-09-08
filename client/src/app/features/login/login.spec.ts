import { TestBed } from '@angular/core/testing';
import { Login } from './login';

describe('Login', () => {
  let component: Login;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
    }).compileComponents();

    const fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // Reach protected members for testing without leaking them into the public API.
  const form = () => (component as unknown as { form: import('@angular/forms').FormGroup }).form;
  const submit = () => (component as unknown as { onSubmit: () => void }).onSubmit();
  const signedIn = () => (component as unknown as { signedIn: () => boolean }).signedIn();

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('is invalid when both fields are empty', () => {
    expect(form().invalid).toBe(true);
  });

  it('flags email as required when blank', () => {
    expect(form().controls['email'].hasError('required')).toBe(true);
  });

  it('flags an invalid email format', () => {
    form().controls['email'].setValue('foo@');
    expect(form().controls['email'].hasError('email')).toBe(true);
  });

  it('flags password as required when blank', () => {
    expect(form().controls['password'].hasError('required')).toBe(true);
  });

  it('is valid with a well-formed email and a non-empty password', () => {
    form().setValue({ email: 'a@b.com', password: 'secret' });
    expect(form().valid).toBe(true);
  });

  it('does not sign in (mock) when submitting an invalid form', () => {
    submit();
    expect(signedIn()).toBe(false);
  });

  it('signs in (mock) when submitting a valid form', () => {
    form().setValue({ email: 'a@b.com', password: 'secret' });
    submit();
    expect(signedIn()).toBe(true);
  });
});
