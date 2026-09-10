import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { Login } from './login';

type LoginInternals = {
  form: { setValue: (v: { email: string; password: string }) => void };
  onSubmit: () => Promise<void>;
  error: () => string | null;
};

describe('Login', () => {
  let component: Login;
  let internals: LoginInternals;
  let authMock: { loading: ReturnType<typeof signal<boolean>>; login: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(async () => {
    authMock = {
      loading: signal(false),
      login: vi.fn().mockResolvedValue({ email: 'a@b.com', name: 'A' }),
    };

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), { provide: AuthService, useValue: authMock }],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    internals = component as unknown as LoginInternals;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not call the API when the email is missing', async () => {
    internals.form.setValue({ email: '', password: '' });
    await internals.onSubmit();
    expect(authMock.login).not.toHaveBeenCalled();
  });

  it('logs in with email only when no password is given', async () => {
    internals.form.setValue({ email: 'a@b.com', password: '' });
    await internals.onSubmit();
    expect(authMock.login).toHaveBeenCalledWith('a@b.com', undefined);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/workspace');
    expect(internals.error()).toBeNull();
  });

  it('forwards the password when given', async () => {
    internals.form.setValue({ email: 'a@b.com', password: 'secret' });
    await internals.onSubmit();
    expect(authMock.login).toHaveBeenCalledWith('a@b.com', 'secret');
  });

  it('shows the "not allowed" message on 403', async () => {
    authMock.login.mockRejectedValueOnce(new HttpErrorResponse({ status: 403 }));
    internals.form.setValue({ email: 'a@b.com', password: '' });
    await internals.onSubmit();
    expect(internals.error()).toBe('החשבון אינו מורשה');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('shows a generic failure message on other errors', async () => {
    authMock.login.mockRejectedValueOnce(new HttpErrorResponse({ status: 500 }));
    internals.form.setValue({ email: 'a@b.com', password: '' });
    await internals.onSubmit();
    expect(internals.error()).toBe('ההתחברות נכשלה, נסה שוב');
  });
});
